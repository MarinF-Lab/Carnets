# Carnets

App web para escanear carnets de trabajadores, organizados por contratista. Se instala en el celular como PWA.

- Especificación completa: [`CLAUDE.md`](CLAUDE.md)
- Configuración de Firebase: [`docs/CONFIGURAR-FIREBASE.md`](docs/CONFIGURAR-FIREBASE.md)

## Desarrollo
```bash
cp .env.local.example .env.local   # y completa los valores
npm install
npm run dev                        # http://localhost:3000
npm run build                      # exportación estática en out/
```

## Stack
Next.js (App Router, `output: 'export'`) · TypeScript · Tailwind CSS · Firebase Auth (Google) + Firestore · Firebase Hosting.

## Estado
- [x] Fase 1 — Proyecto base, login con Google y lista blanca `allowedUsers`
- [ ] Fase 2 — Carpetas de contratistas
- [ ] Fase 3 — Cámara, guardado y PDF
- [ ] Fase 4 — Lectura automática (QR + OCR)
- [ ] Fase 5 — ZIP, PWA y publicación
