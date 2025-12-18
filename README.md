# Market Data API Server

A high-performance, self-hosted API gateway that provides real-time and historical market data via REST and WebSocket interfaces. This solution is designed for ease of deployment and minimal configuration.

## Features

- **Real-time Data**: Low-latency WebSocket feeds for live price updates.
- **Historical Data**: REST endpoints for OHLC (Open, High, Low, Close) candle data across multiple timeframes.
- **Admin Panel**: Built-in web interface for managing API keys, server configuration, and monitoring.
- **Secure**: API Key authentication with domain whitelisting and rate limiting.
- **Documentation**: Auto-generated interactive API documentation (Swagger/OpenAPI).

## Installation

1.  **Install Dependencies**
    ```bash
    npm install
    ```

2.  **Start the Server**
    ```bash
    npm start
    ```

The server will start on port **3001** by default.

## Configuration & Management

### Admin Panel
Access the administration interface to manage access and settings.
- **URL**: `http://localhost:3001/admin`
- **Default Credentials**:
    - Username: `admin`
    - Password: `admin`

*Note: Please change the admin password immediately after the first login via the Admin Panel.*

### API Documentation
Interactive documentation is available to test endpoints directly.
- **URL**: `http://localhost:3001/docs`

## API Usage

### REST API (Snapshot & Candles)
**Endpoint**: `GET /api/v1/quote`

**Parameters**:
- `symbol`: The market symbol (e.g., `BINANCE:BTCUSDT`)
- `timeframe`: Data resolution (e.g., `1D`, `15m`, `1h`)
- `apikey`: Your API Key

**Example**:
```bash
curl "http://localhost:3001/api/v1/quote?symbol=BINANCE:BTCUSDT&timeframe=15m&apikey=YOUR_KEY"
```

### WebSocket API (Real-time Stream)
Connect using any Socket.IO client.

**Connection URL**: `http://localhost:3001`

**Events**:
- `subscribe`: Send a symbol string to start receiving updates.
- `unsubscribe`: Send a symbol string to stop updates.
- `price`: Listen for this event to receive data payloads.

**Example (JavaScript)**:
```javascript
const socket = io('http://localhost:3001', {
  auth: { token: 'YOUR_API_KEY' }
});

socket.on('connect', () => {
  socket.emit('subscribe', 'BINANCE:BTCUSDT');
});

socket.on('price', (data) => {
  console.log('Price Update:', data);
});
```

## System Requirements
- Node.js v16 or higher
- NPM or Yarn
