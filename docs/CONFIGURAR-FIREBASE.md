# Configurar Firebase (plan gratuito Spark)

Proyecto: **carnets-a802e**. Consola: <https://console.firebase.google.com>.

## 1. Plan
En el menú izquierdo debe decir **Spark (sin costo)**. La app no usa Storage ni Cloud Functions.

## 2. Métodos de acceso
**Authentication → Método de acceso**, habilitar:
- **Correo electrónico/contraseña** (usuarios; se guardan como `usuario@usuarios.carnets.app`, nadie necesita un correo real).
- **Google** (administradores).

## 3. Firestore
**Firestore Database** creada en `southamerica-west1` (Santiago), modo producción.

## 4. Reglas de seguridad
```bash
npx firebase-tools deploy --only firestore
```
o pega `firestore.rules` en **Firestore → Reglas → Publicar**.

## 5. Primer administrador
En **Firestore → Datos**, colección `admins`, crea un documento cuyo ID sea el correo de Google en minúsculas
(campo `addedBy`: `consola`). Los siguientes administradores se autorizan desde la app.

## 6. Grupos y usuarios (desde la app)
Entra como **Administrador** con Google y ve a **⚙ Configuración**:
1. **Grupos → Nuevo grupo**: nombre y contraseña del grupo.
2. Comparte la contraseña con el equipo. Cada persona entra en **Usuario** con el nombre que quiera y esa contraseña; la primera vez la app le pregunta si crear el usuario en ese grupo.
3. Para quitar el acceso a alguien: **Usuarios → Desactivar**. Para cambiar la contraseña de un grupo: tócalo → **Cambiar contraseña** (se actualiza para todos sus usuarios).

## 7. `.env.local`
Copia `.env.local.example` como `.env.local` y completa con los valores de
**⚙ Configuración del proyecto → General → Tus apps → App web**:

| Variable | Valor de `firebaseConfig` |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `apiKey` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `projectId` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `appId` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |

Estos valores no son secretos; la protección real son las reglas de Firestore.
