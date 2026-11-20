# Escáner de carnets por contratista — Instrucciones para Claude Code

> **Cómo usar este archivo**
> 1. Crea una carpeta vacía para el proyecto y ábrela en la terminal.
> 2. Copia este archivo dentro de la carpeta con el nombre `CLAUDE.md`.
> 3. Ejecuta `claude` y pega el **Prompt de la Fase 1** (al final del documento).
> 4. Al terminar cada fase, prueba lo indicado en "Cómo verificar" y pega el prompt de la fase siguiente.

---

## 1. Objetivo

Una app web para el celular que permita:

1. Crear **carpetas por contratista**.
2. Dentro de una carpeta, **fotografiar el carnet** de un trabajador por ambos lados.
3. **Leer automáticamente el nombre y el RUT** desde las fotos.
4. Generar **un PDF con ambos lados** con el nombre `Nombre Apellido - Contratista.pdf`.
5. Ver, descargar, compartir y eliminar los PDFs, y **descargar todos los de un contratista en un ZIP**.

Los carnets son datos personales sensibles: solo los usuarios autorizados pueden verlos.

## 2. Stack (todo en el plan gratuito Spark de Firebase)

- **Next.js** (App Router) + **TypeScript** + **Tailwind CSS**
- **Firebase**: Authentication (Google) y **Firestore**. **No usar Firebase Storage** (requiere el plan Blaze).
- **jsPDF** para generar el PDF, **JSZip** para el ZIP
- **QR**: `BarcodeDetector` nativo, con **jsQR** como respaldo
- **OCR**: **Tesseract.js** (gratis, se ejecuta en el navegador) con el idioma `spa`
- **PWA**: manifest + íconos, para instalarla en la pantalla de inicio
- Despliegue: **Firebase Hosting** (exportación estática: `output: 'export'`)

> Todo el procesamiento (cámara, QR, OCR, PDF) ocurre en el navegador. No hay backend propio ni Cloud Functions.
>
> **Idea clave:** las fotos comprimidas se guardan **dentro de Firestore** y el PDF **no se guarda**: se genera en el momento de descargarlo o compartirlo, a partir de esas fotos.
>
> Cuota gratis de Firestore: 1 GiB almacenado, 50.000 lecturas y 20.000 escrituras al día. Alcanza para unos 2.500 a 5.000 carnets.

## 3. Modelo de datos (solo Firestore)

```
contractors/{contractorId}
  name: string
  createdAt: Timestamp
  createdBy: uid

cards/{cardId}                       // documento LIVIANO, el que se lista
  contractorId: string
  name: string                       // "Juan Andrés Pérez Soto"
  rut: string | null                 // "12.345.678-5"
  thumb: string                      // miniatura del frontal: data URL JPEG, 240 px, ~15 KB
  createdAt: Timestamp
  createdBy: uid

cards/{cardId}/images/main           // documento PESADO, se lee solo al ver o descargar
  front: string                      // data URL JPEG
  back: string                       // data URL JPEG

allowedUsers/{email}                 // lista blanca de usuarios autorizados
  role: "admin" | "user"
```

**Reglas de tamaño de las imágenes** (Firestore permite máximo 1 MiB por documento):
- Cada lado: máximo **1400 px** en el lado mayor, JPEG con calidad **0,75**.
- Antes de guardar, calcular el tamaño de `front + back`. Si supera **900 KB**, bajar la calidad de 0,05 en 0,05 (mínimo 0,5) y, si aún no cabe, reducir a 1200 px.
- Guardar `cards/{id}` e `images/main` en una misma **escritura por lotes** (`writeBatch`).
- La lista de una carpeta lee **solo** los documentos `cards` (nunca `images`), para no gastar cuota.

## 4. Seguridad

- Inicio de sesión obligatorio con Google.
- Solo pueden entrar los correos que estén en `allowedUsers`. Los demás ven "Sin acceso".
- **Reglas de Firestore** (`firestore.rules`): leer y escribir solo si `request.auth != null` y existe `allowedUsers/{request.auth.token.email}`. La regla cubre también la subcolección `images`.
- `allowedUsers` solo se puede editar desde la consola de Firebase (sin escritura desde la app).
- Solo un usuario con rol `admin` puede eliminar contratistas.
- Al eliminar un carnet, borrar también `images/main`. Al eliminar un contratista, borrar todos sus carnets y sus imágenes.

## 5. Pantallas

### 5.1 Inicio — Contratistas
- Grilla de **carpetas** (con forma de carpeta con pestaña), cada una con su nombre y su número de carnets.
- Botón **"+ Nuevo contratista"**.
- Buscador que encuentre contratistas y también trabajadores dentro de ellos.

### 5.2 Carpeta de un contratista
- Título con el nombre y acciones: **Renombrar**, **Descargar todo (ZIP)** y **Eliminar** (solo admin, con confirmación).
- Lista de trabajadores: miniatura, nombre, RUT y fecha. Botón **PDF** en cada fila.
- Buscador por nombre o RUT.
- Botón flotante **"+ Escanear carnet"**.

### 5.3 Escaneo (pantalla completa)
1. **Cámara en vivo** (`getUserMedia`, cámara trasera, `facingMode: "environment"`), con un **marco del tamaño de un carnet** (proporción 85,6 × 54).
2. Botón grande **"Capturar"**. La foto se **recorta al marco** automáticamente.
3. Primero se captura el **lado frontal**, después el **trasero**. Cada lado se puede repetir o girar 90°.
4. Respaldo: botón **"Elegir de galería"** (`<input type="file" accept="image/*">`) por si se deniega la cámara.
5. Tras capturar se ejecuta la **lectura automática** (sección 6) y se rellenan los campos **Nombre** y **RUT**.
6. Aviso: **"Revisa que los datos estén correctos"**. Lo que el usuario escriba a mano nunca se sobrescribe.
7. Botón **"Guardar"**, activo solo cuando hay nombre y ambas fotos. Guarda en Firestore según la sección 3.

### 5.4 Detalle de un carnet
- Lee `images/main` y muestra ambos lados en grande, junto al nombre del archivo.
- Botones **Descargar PDF** y **Compartir** (Web Share API con el archivo PDF): ambos generan el PDF en el momento. También **Eliminar**.

## 6. Lectura automática

Ejecutar en este orden y quedarse con el primer resultado válido de cada dato:

**RUT**
1. **QR del reverso** (carnets desde 2013): la URL trae `RUN=12345678-5`. Extraer con `/RUN=([0-9.]+-?[0-9kK])/i`.
2. **OCR del frontal**: buscar un patrón de RUN (`\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]`).
3. Validar siempre con **módulo 11** y formatear como `12.345.678-5`. Si el dígito verificador no coincide, mostrar una advertencia.

**Nombre**
1. **OCR del frontal**: tomar el texto que sigue a las etiquetas `APELLIDOS` y `NOMBRES`.
2. **OCR de la zona MRZ del reverso** (las 3 líneas con `<`): la línea 3 tiene el formato `APELLIDO1<APELLIDO2<<NOMBRE1<NOMBRE2`.
3. Armar el resultado como `Nombres Apellidos` con mayúscula inicial en cada palabra.

**Detalles técnicos**
- Hacer el QR y el OCR sobre la foto **en alta resolución** recién capturada, antes de comprimirla para guardarla.
- Cargar Tesseract.js de forma diferida (solo al abrir el escáner) y reutilizar el mismo worker.
- Antes del OCR, pasar la imagen a escala de grises y aumentar el contraste.
- Mostrar el estado: "Leyendo datos…", "Datos leídos" o "No se pudieron leer".
- Dejar la lectura en un módulo `lib/ocr.ts` con una interfaz `readCard(front, back) => { name, rut, source }`, para poder cambiarla más adelante sin tocar el resto de la app.

## 7. PDF (se genera al momento, no se guarda)

- Función `buildPdf(card, images, contractorName) => Blob` en `lib/pdf.ts`.
- Hoja A4 vertical, márgenes de 15 mm.
- Encabezado: **nombre** en negrita, y debajo `Contratista: X · RUT: Y · Fecha: dd-mm-aaaa` (la fecha del escaneo).
- **Lado frontal** en la mitad superior y **lado trasero** en la inferior, cada uno con su etiqueta y respetando la proporción.
- Nombre del archivo: `Nombre Apellido - Contratista.pdf`, sin los caracteres `\ / : * ? " < > |`.
- ZIP: generar los PDFs uno por uno (leyendo cada `images/main`) y empaquetarlos en `Contratista.zip`. Mostrar el progreso ("3 de 12…"). Si dos archivos tienen el mismo nombre, agregar `(2)`, `(3)`, etc.

## 8. Diseño

- Pensado primero para el celular: botones de al menos 44 px y textos de 16 px.
- Colores: fondo piedra `#e7e4df`, texto negro `#141210`, acento ladrillo `#c8371e`, tarjetas blancas. Modo oscuro con fondo `#171513`.
- Tipografía: **Schibsted Grotesk** (Google Fonts).
- Toda la interfaz en español de Chile.

## 9. Estructura sugerida

```
app/
  layout.tsx
  page.tsx                      // contratistas
  contratista/page.tsx          // carpeta (?id=...)
  escanear/page.tsx             // escaneo (?contratista=...)
  carnet/page.tsx               // detalle (?id=...)
components/  Folder.tsx, CardRow.tsx, CameraCapture.tsx, ConfirmDialog.tsx
lib/         firebase.ts, db.ts, pdf.ts, ocr.ts, qr.ts, rut.ts, image.ts
firestore.rules
public/manifest.json, icons/
```

> Se usan parámetros de búsqueda (`?id=`) en vez de rutas dinámicas para que funcione con `output: 'export'` en Firebase Hosting.

---

## Fases y prompts para pegar en Claude Code

### Fase 1 — Proyecto base y autenticación
**Prompt:**
> Lee CLAUDE.md. Crea el proyecto Next.js con TypeScript y Tailwind, configura Firebase (solo Auth con Google y Firestore, sin Storage) usando variables de entorno en `.env.local`, y crea el login con la lista blanca `allowedUsers`. Incluye `firestore.rules` según la sección 4. Explícame paso a paso cómo crear el proyecto en la consola de Firebase en el plan gratuito Spark y qué valores poner en `.env.local`.

**Cómo verificar:** inicias sesión con tu correo (agregado en `allowedUsers`) y entras; otro correo ve "Sin acceso".

### Fase 2 — Carpetas de contratistas
**Prompt:**
> Implementa las pantallas 5.1 y 5.2 de CLAUDE.md (sin escaneo todavía): crear, renombrar, buscar y eliminar contratistas, y la lista vacía de carnets.

**Cómo verificar:** creas 2 o 3 contratistas, los renombras y los eliminas, y los cambios se mantienen al recargar.

### Fase 3 — Cámara, guardado y PDF
**Prompt:**
> Implementa la pantalla de escaneo 5.3 con cámara en vivo, marco de carnet y recorte automático, respaldo de galería y giro de 90°. Guarda el carnet en Firestore siguiendo exactamente la sección 3 (documento liviano + `images/main`, compresión bajo 900 KB, `writeBatch`). Implementa el detalle 5.4 y la generación del PDF al momento según la sección 7, con descargar, compartir y eliminar. Por ahora el nombre y el RUT se escriben a mano.

**Cómo verificar:** escaneas un carnet y aparece en la carpeta; el PDF descargado muestra ambos lados y tiene el nombre correcto. En la consola de Firebase, el documento `images/main` pesa menos de 1 MB.

### Fase 4 — Lectura automática
**Prompt:**
> Implementa la sección 6 de CLAUDE.md: QR del reverso, OCR con Tesseract.js del frontal y de la MRZ, validación de RUT con módulo 11 y rellenado automático sin sobrescribir lo que el usuario escribió. Deja la interfaz `readCard` en `lib/ocr.ts`. Agrega pruebas unitarias para `rut.ts` y para el análisis de la MRZ.

**Cómo verificar:** con un carnet nuevo, el RUT sale del QR; el nombre se rellena en la mayoría de las fotos nítidas.

### Fase 5 — ZIP, PWA y publicación
**Prompt:**
> Agrega la descarga ZIP por contratista con barra de progreso, convierte la app en PWA (manifest e íconos) y publícala en Firebase Hosting. Explícame paso a paso los comandos de despliegue.

**Cómo verificar:** abres la URL en el celular, la instalas en la pantalla de inicio y descargas el ZIP de un contratista.

### Integración futura
Esta app puede pasar a ser un módulo de la **app de control de asistencia** (mismo stack), y cada carnet quedaría ligado a la ficha de su trabajador.
