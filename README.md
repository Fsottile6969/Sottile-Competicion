# 🔧 TallerPro — Sistema de Gestión de Taller Mecánico

## Requisitos previos

1. **Instalar Node.js** (versión 18 o superior)
   - Descargar desde: https://nodejs.org/es/download
   - Elegir la versión **LTS** e instalar normalmente
   - Verificar instalación abriendo CMD y ejecutando: `node -v`

---

## Instalación

1. Abrir **CMD** o **PowerShell** en la carpeta del proyecto:
   ```
   cd C:\Users\fsott\Desktop\Taller
   ```

2. Instalar dependencias:
   ```
   npm install
   ```

3. Iniciar el servidor:
   ```
   npm start
   ```

4. Abrir el navegador en: **http://localhost:3000**

---

## Credenciales por defecto

| Rol | Email | Contraseña |
|-----|-------|------------|
| Admin | admin@taller.com | admin123 |

> ⚠️ Cambiar estas credenciales en el archivo `.env` antes de usar en producción.

---

## Funcionalidades

### Panel Cliente
- ✅ Registro con email y contraseña
- ✅ Login con Google (requiere configuración de Google Client ID)
- ✅ Gestión de vehículos (agregar, ver)
- ✅ Reserva de turnos con selección de fecha y horario disponible
- ✅ Cancelación de turnos pendientes
- ✅ Notificaciones push al reservar y cuando el vehículo está listo

### Panel Administrador
- ✅ Dashboard con estadísticas en tiempo real
- ✅ Gestión completa de turnos (filtrar por fecha y estado)
- ✅ Cambio de estado: Pendiente → En proceso → Terminado
- ✅ Registro de trabajos realizados con costos
- ✅ Notas para el cliente
- ✅ Comunicación directa por WhatsApp con un clic
- ✅ Listado de clientes con acceso a WhatsApp
- ✅ Notificaciones push al recibir nuevos turnos

---

## Configurar Login con Google (opcional)

1. Ir a https://console.cloud.google.com
2. Crear un proyecto nuevo
3. Habilitar **Google Identity Services**
4. Crear credenciales OAuth 2.0 (tipo: Aplicación web)
5. Agregar `http://localhost:3000` en orígenes autorizados
6. Copiar el **Client ID** y reemplazar `TU_GOOGLE_CLIENT_ID.apps.googleusercontent.com` en `public/index.html`

---

## Configurar Notificaciones Push (opcional)

Las claves VAPID del `.env` son de ejemplo. Para generar las tuyas:

```
node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(k)"
```

Reemplazar `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` en `.env` y también la clave pública en `public/cliente.html` y `public/admin.html` (variable `applicationServerKey`).

---

## Configurar WhatsApp del taller

En el archivo `.env`, cambiar:
```
TALLER_WHATSAPP=5491112345678   ← número del taller (sin + ni espacios)
TALLER_NOMBRE=Taller Mecánico
```

---

## Estructura del proyecto

```
Taller/
├── server.js           # Servidor Express principal
├── database.js         # Base de datos SQLite
├── middleware.js        # Autenticación JWT
├── notifications.js    # Notificaciones push
├── routes/
│   ├── auth.js         # Login, registro, Google OAuth
│   ├── turnos.js       # Turnos y vehículos (clientes)
│   └── admin.js        # Panel administrador
├── public/
│   ├── index.html      # Login / Registro
│   ├── cliente.html    # Panel del cliente
│   ├── admin.html      # Panel del administrador
│   ├── sw.js           # Service Worker (push notifications)
│   └── css/style.css   # Estilos
├── .env                # Variables de entorno
└── package.json
```
