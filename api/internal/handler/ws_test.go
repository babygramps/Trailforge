package handler

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
)

// newWSTestServer creates an httptest.Server with the WSHub mounted at /ws/live.
// The server is configured without JWT middleware so that the ?user_id query
// parameter is sufficient for identification (matching the handler's fallback).
func newWSTestServer(hub *WSHub) *httptest.Server {
	e := echo.New()
	e.HideBanner = true
	hub.Register(e.Group("/ws"))
	return httptest.NewServer(e)
}

// wsURL converts an httptest server URL to a WebSocket URL with a user_id param.
func wsURL(srv *httptest.Server, userID string) string {
	return "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws/live?user_id=" + userID
}

// dialWS is a helper that dials a WebSocket connection and fails the test on error.
func dialWS(t *testing.T, url string) *websocket.Conn {
	t.Helper()
	conn, resp, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		body := ""
		if resp != nil {
			body = resp.Status
		}
		t.Fatalf("websocket dial failed: %v (%s)", err, body)
	}
	return conn
}

func TestWS_Hub_ConnectDisconnect(t *testing.T) {
	hub := NewWSHub()
	srv := newWSTestServer(hub)
	defer srv.Close()

	conn := dialWS(t, wsURL(srv, "alice"))

	// Give the hub time to register the client.
	time.Sleep(50 * time.Millisecond)
	if hub.ClientCount() != 1 {
		t.Fatalf("expected 1 client, got %d", hub.ClientCount())
	}

	conn.Close()
	time.Sleep(50 * time.Millisecond)

	if hub.ClientCount() != 0 {
		t.Fatalf("expected 0 clients after disconnect, got %d", hub.ClientCount())
	}
}

func TestWS_Hub_BroadcastPosition(t *testing.T) {
	hub := NewWSHub()
	srv := newWSTestServer(hub)
	defer srv.Close()

	connA := dialWS(t, wsURL(srv, "alice"))
	defer connA.Close()
	connB := dialWS(t, wsURL(srv, "bob"))
	defer connB.Close()

	time.Sleep(50 * time.Millisecond)

	// Alice sends a position update.
	update := PositionUpdate{
		Lat:       37.7567,
		Lon:       -119.5966,
		Ele:       1209,
		Speed:     1.5,
		Bearing:   180,
		Accuracy:  3.0,
		Timestamp: time.Now().Unix(),
	}
	data, _ := json.Marshal(update)
	if err := connA.WriteMessage(websocket.TextMessage, data); err != nil {
		t.Fatalf("write failed: %v", err)
	}

	// Bob should receive the update.
	connB.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, msg, err := connB.ReadMessage()
	if err != nil {
		t.Fatalf("bob read failed: %v", err)
	}

	var received PositionUpdate
	if err := json.Unmarshal(msg, &received); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if received.UserID != "alice" {
		t.Fatalf("expected sender UserID=alice, got %s", received.UserID)
	}

	// Alice should NOT receive her own message. Set a short deadline.
	connA.SetReadDeadline(time.Now().Add(200 * time.Millisecond))
	_, _, err = connA.ReadMessage()
	if err == nil {
		t.Fatal("alice should NOT receive her own position update")
	}
}

func TestWS_Hub_MultipleClients(t *testing.T) {
	hub := NewWSHub()
	srv := newWSTestServer(hub)
	defer srv.Close()

	const numClients = 5
	conns := make([]*websocket.Conn, numClients)
	for i := 0; i < numClients; i++ {
		conns[i] = dialWS(t, wsURL(srv, "user-"+string(rune('A'+i))))
		defer conns[i].Close()
	}

	time.Sleep(50 * time.Millisecond)
	if hub.ClientCount() != numClients {
		t.Fatalf("expected %d clients, got %d", numClients, hub.ClientCount())
	}

	// Client 0 sends a message.
	update := PositionUpdate{Lat: 37.0, Lon: -119.0, Timestamp: time.Now().Unix()}
	data, _ := json.Marshal(update)
	if err := conns[0].WriteMessage(websocket.TextMessage, data); err != nil {
		t.Fatalf("write failed: %v", err)
	}

	// Clients 1-4 should receive it.
	for i := 1; i < numClients; i++ {
		conns[i].SetReadDeadline(time.Now().Add(2 * time.Second))
		_, msg, err := conns[i].ReadMessage()
		if err != nil {
			t.Fatalf("client %d read failed: %v", i, err)
		}
		var received PositionUpdate
		if err := json.Unmarshal(msg, &received); err != nil {
			t.Fatalf("client %d unmarshal: %v", i, err)
		}
	}
}

func TestWS_Hub_ReplaceDuplicateUser(t *testing.T) {
	hub := NewWSHub()
	srv := newWSTestServer(hub)
	defer srv.Close()

	conn1 := dialWS(t, wsURL(srv, "alice"))
	time.Sleep(50 * time.Millisecond)

	if hub.ClientCount() != 1 {
		t.Fatalf("expected 1, got %d", hub.ClientCount())
	}

	// Same user_id connects again.
	conn2 := dialWS(t, wsURL(srv, "alice"))
	defer conn2.Close()
	time.Sleep(50 * time.Millisecond)

	// The old connection should have been closed by the hub.
	if hub.ClientCount() != 1 {
		t.Fatalf("expected 1 after replacement, got %d", hub.ClientCount())
	}

	// Reading from the old connection should fail because it was closed.
	conn1.SetReadDeadline(time.Now().Add(200 * time.Millisecond))
	_, _, err := conn1.ReadMessage()
	if err == nil {
		t.Fatal("old connection should be closed")
	}
	conn1.Close()
}

func TestWS_Hub_InvalidJSON(t *testing.T) {
	hub := NewWSHub()
	srv := newWSTestServer(hub)
	defer srv.Close()

	connA := dialWS(t, wsURL(srv, "alice"))
	defer connA.Close()
	connB := dialWS(t, wsURL(srv, "bob"))
	defer connB.Close()
	time.Sleep(50 * time.Millisecond)

	// Send garbage that's not valid JSON.
	if err := connA.WriteMessage(websocket.TextMessage, []byte("not json!!")); err != nil {
		t.Fatalf("write garbage failed: %v", err)
	}

	// The connection should still be alive. Send a valid message.
	update := PositionUpdate{Lat: 37.0, Lon: -119.0, Timestamp: time.Now().Unix()}
	data, _ := json.Marshal(update)
	if err := connA.WriteMessage(websocket.TextMessage, data); err != nil {
		t.Fatalf("write valid failed after garbage: %v", err)
	}

	// Bob should receive the valid message.
	connB.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, msg, err := connB.ReadMessage()
	if err != nil {
		t.Fatalf("bob read failed: %v", err)
	}

	var received PositionUpdate
	if err := json.Unmarshal(msg, &received); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if received.UserID != "alice" {
		t.Fatalf("expected alice, got %s", received.UserID)
	}
}

func TestWS_Hub_ConcurrentBroadcast(t *testing.T) {
	// This test verifies that the hub's client map operations (addClient,
	// removeClient, broadcast, ClientCount) are safe under concurrent access.
	// We use a single sender to avoid gorilla/websocket's concurrent-write
	// limitation, and focus on concurrent connect/disconnect + broadcast.
	hub := NewWSHub()
	srv := newWSTestServer(hub)
	defer srv.Close()

	// Sender stays connected and sends sequentially.
	sender := dialWS(t, wsURL(srv, "sender"))
	defer sender.Close()
	time.Sleep(50 * time.Millisecond)

	const rounds = 10
	const msgsPerRound = 10

	var wg sync.WaitGroup

	// Goroutines that rapidly connect and disconnect receivers.
	for i := 0; i < rounds; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			uid := "rapid-" + string(rune('A'+idx))
			c := dialWS(t, wsURL(srv, uid))
			// Read a few messages (or timeout quickly).
			c.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
			for {
				_, _, err := c.ReadMessage()
				if err != nil {
					break
				}
			}
			c.Close()
		}(i)
	}

	// Meanwhile, the sender sends messages sequentially.
	for j := 0; j < msgsPerRound; j++ {
		update := PositionUpdate{
			Lat:       37.0 + float64(j)*0.001,
			Lon:       -119.0,
			Timestamp: time.Now().Unix(),
		}
		data, _ := json.Marshal(update)
		sender.WriteMessage(websocket.TextMessage, data)
		time.Sleep(10 * time.Millisecond)
	}

	wg.Wait()
	// If we reach here without a data race or deadlock, the test passes.
}

func TestWS_Hub_PositionUpdateFields(t *testing.T) {
	hub := NewWSHub()
	srv := newWSTestServer(hub)
	defer srv.Close()

	connA := dialWS(t, wsURL(srv, "alice"))
	defer connA.Close()
	connB := dialWS(t, wsURL(srv, "bob"))
	defer connB.Close()
	time.Sleep(50 * time.Millisecond)

	ts := time.Now().Unix()
	update := PositionUpdate{
		Lat:       37.7567,
		Lon:       -119.5966,
		Ele:       1209.5,
		Speed:     2.3,
		Bearing:   45.0,
		Accuracy:  5.0,
		Timestamp: ts,
	}
	data, _ := json.Marshal(update)
	if err := connA.WriteMessage(websocket.TextMessage, data); err != nil {
		t.Fatalf("write: %v", err)
	}

	connB.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, msg, err := connB.ReadMessage()
	if err != nil {
		t.Fatalf("read: %v", err)
	}

	var received PositionUpdate
	if err := json.Unmarshal(msg, &received); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	// The sender's UserID should be set by the hub.
	if received.UserID != "alice" {
		t.Fatalf("UserID: expected alice, got %s", received.UserID)
	}
	if received.Lat != 37.7567 {
		t.Fatalf("Lat: expected 37.7567, got %f", received.Lat)
	}
	if received.Lon != -119.5966 {
		t.Fatalf("Lon: expected -119.5966, got %f", received.Lon)
	}
	if received.Ele != 1209.5 {
		t.Fatalf("Ele: expected 1209.5, got %f", received.Ele)
	}
	if received.Speed != 2.3 {
		t.Fatalf("Speed: expected 2.3, got %f", received.Speed)
	}
	if received.Bearing != 45.0 {
		t.Fatalf("Bearing: expected 45.0, got %f", received.Bearing)
	}
	if received.Accuracy != 5.0 {
		t.Fatalf("Accuracy: expected 5.0, got %f", received.Accuracy)
	}
	if received.Timestamp != ts {
		t.Fatalf("Timestamp: expected %d, got %d", ts, received.Timestamp)
	}
}
