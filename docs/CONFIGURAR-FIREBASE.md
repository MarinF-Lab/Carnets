# Configurar Firebase (plan gratuito Spark)

Proyecto: **carnets-a802e**. Todo se hace en <https://console.firebase.google.com>.

## 1. Verificar el plan
En la parte inferior del menú izquierdo debe decir **Spark (sin costo)**. No actives Blaze: la app no usa Storage ni Cloud Functions.

## 2. App web (ya hecha)
La configuración que copiaste (`apiKey`, `authDomain`, etc.) sale de
**⚙️ Configuración del proyecto → General → Tus apps → App web**. Si algún día la necesitas de nuevo, está ahí.

## 3. Activar el login con Google
1. Menú **Compilación → Authentication → Comenzar**.
2. Pestaña **Método de acceso → Google → Habilitar**.
3. Elige un **correo de asistencia** (el tuyo) y **Guardar**.
4. Pestaña **Configuración → Dominios autorizados**: `localhost` ya viene incluido. Al publicar (Fase 5) se agregan `carnets-a802e.web.app` y `carnets-a802e.firebaseapp.com` automáticamente.

## 4. Crear Firestore
1. Menú **Compilación → Firestore Database → Crear base de datos**.
2. Ubicación: **southamerica-west1 (Santiago)**. *No se puede cambiar después.*
3. Modo: **producción**.

## 5. Publicar las reglas de seguridad
Opción A (consola): en **Firestore → Reglas**, borra el contenido, pega el archivo `firestore.rules` de este repositorio y presiona **Publicar**.

Opción B (terminal), desde la carpeta del proyecto:
```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules
```

## 6. Agregarte a la lista blanca
1. En **Firestore → Datos → + Iniciar colección**.
2. ID de la colección: `allowedUsers`.
3. ID del documento: **tu correo en minúsculas**, por ejemplo `nombre@gmail.com`.
4. Campo: `role` · tipo `string` · valor `admin`.
5. **Guardar**.

Para autorizar a otra persona, agrega otro documento con su correo y `role` = `user` (o `admin` si podrá eliminar contratistas). Para quitarle el acceso, borra su documento.

## 7. Archivo `.env.local`
En la raíz del proyecto, copia `.env.local.example` como `.env.local` y completa:

| Variable | Valor de `firebaseConfig` | Tu valor |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `apiKey` | `AIzaSyBOtR70…` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `authDomain` | `carnets-a802e.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `projectId` | `carnets-a802e` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `appId` | `1:584578907529:web:1f8c…` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` | `584578907529` |

`storageBucket` no se usa. El archivo `.env.local` **no se sube a Git**.

> Estos valores no son secretos (viajan al navegador de todas formas). La protección real son las **reglas de Firestore** y la lista `allowedUsers`.

## 8. Probar
```bash
npm install
npm run dev
```
Abre <http://localhost:3000>:
- Con tu correo (agregado en `allowedUsers`) entras a **Contratistas**.
- Con otro correo aparece **"Sin acceso"**.
