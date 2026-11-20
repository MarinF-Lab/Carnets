# Configurar Firebase (plan gratuito Spark)

Proyecto: **carnets-a802e**. Consola: <https://console.firebase.google.com>.

## 1. Plan
En el menú izquierdo debe decir **Spark (sin costo)**. La app no usa Storage ni Cloud Functions.

## 2. Acceso con usuario y contraseña
**Authentication → Método de acceso → Correo electrónico/contraseña → Habilitar.**
(Los usuarios de la app se guardan como `usuario@usuarios.carnets.app`; nadie necesita un correo real.)

## 3. Firestore
**Firestore Database** creada en `southamerica-west1` (Santiago), modo producción.

## 4. Reglas de seguridad
```bash
npx firebase-tools deploy --only firestore
```
o pega `firestore.rules` en **Firestore → Reglas → Publicar**.

## 5. Configuración inicial (una sola vez)
Abre la app. Como aún no hay usuarios, aparece **Configuración inicial**:
1. Escribe tu usuario de administrador (ej.: `isaac`).
2. Elige la **contraseña común** del equipo (mínimo 8 caracteres).

Hazlo apenas publiques la app: quien la complete primero queda como administrador.

## 6. Agregar al equipo
En la app: **⚙ Configuración → Usuarios → Agregar usuario**. Cada persona entra con su usuario y la contraseña común.
Para quitar el acceso a alguien: **Desactivar**.

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

Estos valores no son secretos; la protección real son las reglas de Firestore y la lista `users`.
