package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"

	"github.com/babygramps/trailforge/internal/middleware"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for self-hosted deployment.
	},
}

// PositionUpdate represents a live GPS position broadcast over WebSocket.
type PositionUpdate struct {
	UserID    string  `json:"user_id"`
	Lat       float64 `json:"lat"`
	Lon       float64 `json:"lon"`
	Ele       float64 `json:"ele"`
	Speed     float64 `json:"speed"`
	Bearing   float64 `json:"bearing"`
	Accuracy  float64 `json:"accuracy"`
	Timestamp int64   `json:"timestamp"`
}

// WSHub manages connected WebSocket clients and broadcasts position updates.
type WSHub struct {
	mu      sync.RWMutex
	clients map[string]*websocket.Conn // keyed by user ID
}

// NewWSHub creates a new WebSocket hub.
func NewWSHub() *WSHub {
	return &WSHub{
		clients: make(map[string]*websocket.Conn),
	}
}

// Register attaches the WebSocket handler.
func (hub *WSHub) Register(g *echo.Group) {
	g.GET("/live", hub.HandleWS)
}

// HandleWS upgrades the HTTP connection to a WebSocket and manages the
// bidirectional message loop. Incoming messages are position updates that
// get broadcast to all other connected clients.
func (hub *WSHub) HandleWS(c echo.Context) error {
	userID := middleware.GetUserID(c)
	if userID == "" {
		// Try query parameter for WebSocket connections where headers are awkward.
		userID = c.QueryParam("user_id")
	}
	if userID == "" {
		return echo.NewHTTPError(http.StatusUnauthorized, "authentication required")
	}

	conn, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		log.Printf("websocket upgrade failed: %v", err)
		return err
	}

	hub.addClient(userID, conn)
	defer hub.removeClient(userID, conn)

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("websocket read error for user %s: %v", userID, err)
			}
			break
		}

		var update PositionUpdate
		if err := json.Unmarshal(msg, &update); err != nil {
			log.Printf("invalid position update from user %s: %v", userID, err)
			continue
		}
		update.UserID = userID

		hub.broadcast(userID, update)
	}

	return nil
}

// addClient registers a WebSocket connection for a user.
func (hub *WSHub) addClient(userID string, conn *websocket.Conn) {
	hub.mu.Lock()
	defer hub.mu.Unlock()

	// Close any existing connection for the same user.
	if existing, ok := hub.clients[userID]; ok {
		existing.Close()
	}
	hub.clients[userID] = conn
}

// removeClient unregisters and closes a WebSocket connection.
func (hub *WSHub) removeClient(userID string, conn *websocket.Conn) {
	hub.mu.Lock()
	defer hub.mu.Unlock()

	// Only remove if it's the same connection (could have been replaced).
	if existing, ok := hub.clients[userID]; ok && existing == conn {
		delete(hub.clients, userID)
	}
	conn.Close()
}

// broadcast sends a position update to all connected clients except the sender.
func (hub *WSHub) broadcast(senderID string, update PositionUpdate) {
	data, err := json.Marshal(update)
	if err != nil {
		return
	}

	hub.mu.RLock()
	defer hub.mu.RUnlock()

	for uid, conn := range hub.clients {
		if uid == senderID {
			continue
		}
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			log.Printf("websocket write error for user %s: %v", uid, err)
		}
	}
}

// ClientCount returns the number of currently connected clients.
func (hub *WSHub) ClientCount() int {
	hub.mu.RLock()
	defer hub.mu.RUnlock()
	return len(hub.clients)
}
