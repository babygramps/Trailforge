package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/labstack/echo/v4"
	echomw "github.com/labstack/echo/v4/middleware"

	"github.com/babygramps/trailforge/internal/config"
	"github.com/babygramps/trailforge/internal/handler"
	"github.com/babygramps/trailforge/internal/middleware"
	"github.com/babygramps/trailforge/internal/repository"
)

func main() {
	// ---- configuration ----
	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		log.Fatalf("configuration error: %v", err)
	}

	// ---- database ----
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	db, err := repository.NewDB(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database connection failed: %v", err)
	}
	defer db.Close()
	log.Println("connected to PostgreSQL")

	// ---- repositories ----
	userRepo := repository.NewUserRepository(db)
	trackRepo := repository.NewTrackRepository(db)
	waypointRepo := repository.NewWaypointRepository(db)

	// ---- echo ----
	e := echo.New()
	e.HideBanner = true

	// Global middleware.
	e.Use(echomw.Logger())
	e.Use(echomw.Recover())
	e.Use(echomw.CORSWithConfig(echomw.CORSConfig{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions},
		AllowHeaders: []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAccept, echo.HeaderAuthorization},
	}))

	// JWT authentication middleware (skips public routes internally).
	e.Use(middleware.JWTAuth(cfg.JWTSecret))

	// ---- route groups ----
	api := e.Group("/api")

	// Health.
	healthHandler := handler.NewHealthHandler(db, cfg)
	healthHandler.Register(api.Group("/health"))

	// Auth.
	authHandler := handler.NewAuthHandler(userRepo, cfg.JWTSecret)
	authHandler.Register(api.Group("/auth"))

	// Tracks.
	trackHandler := handler.NewTrackHandler(trackRepo)
	trackHandler.Register(api.Group("/tracks"))

	// Routes.
	routeHandler := handler.NewRouteHandler(db.Pool, cfg.ValhallaURL)
	routeHandler.Register(api.Group("/routes"))

	// Waypoints.
	waypointHandler := handler.NewWaypointHandler(waypointRepo)
	waypointHandler.Register(api.Group("/waypoints"))

	// WebSocket.
	wsHub := handler.NewWSHub()
	wsHub.Register(e.Group("/ws"))

	// ---- graceful shutdown ----
	addr := fmt.Sprintf(":%s", cfg.APIPort)
	go func() {
		log.Printf("starting TrailForge API on %s", addr)
		if err := e.Start(addr); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("shutting down server...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := e.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("server forced to shutdown: %v", err)
	}
	log.Println("server stopped")
}
