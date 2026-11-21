# Carnets

App web para escanear carnets de trabajadores, organizados por contratista. Se instala en el celular como PWA.

- Especificación completa: [`CLAUDE.md`](CLAUDE.md)
- Configuración de Firebase: [`docs/CONFIGURAR-FIREBASE.md`](docs/CONFIGURAR-FIREBASE.md)

## Acceso
- **Usuario**: entra con su usuario y la **contraseña de su grupo**. La primera vez se registra solo (la app pregunta en qué grupo crearlo según la contraseña). Los usuarios del mismo grupo comparten datos; solo pueden agregar (no renombrar ni eliminar).
- **Administrador**: entra con **Google** (correos autorizados). Crea grupos y sus contraseñas, desactiva o cambia de grupo a usuarios, autoriza otros administradores y ve todos los grupos.

## Desarrollo
```bash
cp .env.local.example .env.local   # y completa los valores
npm install
npm run dev                        # http://localhost:3000
npm run build                      # exportación estática en out/
```

## Stack
Next.js (App Router, `output: 'export'`) · TypeScript · Tailwind CSS · Firebase Auth (usuario y contraseña / Google) + Firestore · Firebase Hosting.

## Estado
- [x] Fase 1 — Proyecto base, login con Google y lista blanca `allowedUsers`
- [x] Fase 2 — Carpetas de contratistas
- [x] Fase 3 — Cámara, guardado y PDF
- [x] Fase 4 — Lectura automática (OCR del frontal + MRZ del reverso)
- [x] Fase 5 — ZIP, PWA y publicación

App publicada: https://carnets-a802e.web.app

## Publicar una nueva versión
```bash
npm run build
npx firebase-tools deploy --only hosting      # la app
npx firebase-tools deploy --only firestore    # las reglas, si cambiaron
```

## Pruebas
```bash
npm test
```

Para probar sin tocar los datos reales, usa los emuladores de Firebase:
```bash
npx firebase-tools emulators:start --only auth,firestore
NEXT_PUBLIC_USE_EMULATORS=1 npm run dev
```
