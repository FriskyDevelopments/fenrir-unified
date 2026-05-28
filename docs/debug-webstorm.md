# Debug del proyecto en WebStorm

Proyecto principal:
```bash
apps/fenrir-bridge
```

## 1. Debug del Frontend Vite

Desde la terminal de WebStorm:

```bash
cd apps/fenrir-bridge
npm run dev
```

Cuando aparezca la URL, normalmente:

`http://localhost:5173`

abre la app con **Cmd + Click** o crea una configuración:

**Run → Edit Configurations → + → JavaScript Debug**

Configura:
- **URL**: `http://localhost:5173`
- **Browser**: Chrome

Luego puedes usar breakpoints directamente en WebStorm.

---

## 2. Debug de API y Login con auth.http

Crea o abre:
`auth.http`

Ejecuta primero el login:

### Login
```http
POST {{host}}/auth/login
Content-Type: application/json

{
  "email": "{{email}}",
  "password": "{{password}}"
}
```

> {%
  console.log("LOGIN STATUS:", response.status);
  console.log("LOGIN HEADERS:", response.headers);
  console.log("LOGIN BODY:", response.body);
  if (response.body.access_token) {
    client.global.set("access_token", response.body.access_token);
  }
  if (response.body.token) {
    client.global.set("access_token", response.body.token);
  }
  if (response.body.session && response.body.session.access_token) {
    client.global.set("access_token", response.body.session.access_token);
  }
%}

Luego prueba una ruta protegida:

### Test authenticated route
```http
GET {{host}}/api/me
Authorization: Bearer {{access_token}}
```

> {%
  console.log("ME STATUS:", response.status);
  console.log("ME BODY:", response.body);
%}

### Ambiente público (`http-client.env.json`):
```json
{
  "dev": {
    "host": "http://localhost:3000"
  }
}
```

### Credenciales privadas (`http-client.private.env.json`):
```json
{
  "dev": {
    "email": "you@example.com",
    "password": "your-password"
  }
}
```

Y agrega esto a `.gitignore`:
```text
http-client.private.env.json
.idea/httpRequests/
```

---

## 3. Debug de Frisky MCP

Si el servidor MCP está dentro de `apps/fenrir-bridge`, ejecuta:

```bash
cd apps/fenrir-bridge
npm run mcp:beta:dev
```

Prueba el endpoint MCP desde `auth.http`:

### Frisky MCP initialize probe
```http
POST https://mcp.friskydev.com/mcp
Accept: application/json, text/event-stream
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-03-26",
    "capabilities": {},
    "clientInfo": {
      "name": "webstorm-debug",
      "version": "0.1.0"
    }
  }
}
```

> {%
  console.log("MCP STATUS:", response.status);
  console.log("MCP HEADERS:", response.headers);
  console.log("MCP BODY:", response.body);
%}

**Resultado esperado para POST /mcp:**
`Content-Type: application/json` o `Content-Type: text/event-stream`

Si el error es:
`Expected Content-Type text/event-stream but was application/json`

entonces JetBrains está intentando conectar como SSE GET. En ese caso, tu servidor no debe responder JSON en `GET /mcp`; debe responder `405 Method Not Allowed` o `text/event-stream`.

---

## 4. Crear botones de Debug en WebStorm

Para no usar la terminal:

1. Ve a **Run → Edit Configurations...**
2. Haz clic en **+**
3. Selecciona **npm**
4. En **package.json**, selecciona: `apps/fenrir-bridge/package.json`
5. En **Command**, usa: `run`
6. En **Scripts**, selecciona: `dev`
7. Guarda la configuración.
8. Ejecuta con el botón de **Debug**.

Crea otra configuración npm para MCP:
- **package.json**: `apps/fenrir-bridge/package.json`
- **Command**: `run`
- **Scripts**: `mcp:beta:dev`

---

## 5. Orden recomendado para debug

1. Ejecutar frontend: `npm run dev`
2. Ejecutar MCP si aplica: `npm run mcp:beta:dev`
3. Correr Login en `auth.http`
4. Correr ruta protegida `/api/me`
5. Correr Frisky MCP initialize probe
6. Revisar logs en **Services / HTTP Client / Terminal**

---

## 6. Checklist rápido

- [ ] Frontend abre en `localhost:5173`
- [ ] Backend/API responde en `localhost:3000`
- [ ] `auth.http` usa ambiente `dev`
- [ ] Login devuelve 200 o 201
- [ ] `access_token` se guarda correctamente
- [ ] `/api/me` responde 200
- [ ] `/mcp` responde JSON-RPC válido en POST
- [ ] `GET /mcp` no devuelve JSON si el cliente espera SSE
