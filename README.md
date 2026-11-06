# Cuadrante Docente

Aplicación web para planificar el horario del profesorado de un centro de FP:

- **Grupos y módulos**: cada grupo con su día de clase, sus franjas y sus módulos (con docente, desdoble y fechas). Los módulos rotan a lo largo del curso.
- **Horario por docente**: agenda semanal con las clases (salen solas según la rotación) y las guardias, tutorías, reuniones u otras ocupaciones que vas añadiendo, con su vigencia por semanas.
- **Mínimo semanal**: total de horas de cada docente por semana frente a su mínimo (24 h, 21 h, 18 h…), con avisos cuando falta o sobra.
- **Avisos**: qué módulo empieza o termina cada semana, sesiones sin módulo, choques entre una guardia y una clase nueva, docentes por debajo de su mínimo.
- **Calendario y horas**: fechas del curso, festivos y horario del centro por día (sesiones, recreos y sesiones fijas para todo el claustro, como la RD).

Funciona en el navegador, se puede instalar en el ordenador o el móvil («Instalar aplicación») y abre sin conexión.

**Dirección de la app:** <https://samukftv.github.io/app-de-gestion-de-horas/>

## Dónde se guardan los datos

- **Con Firebase configurado** (recomendado): entras con tu cuenta de Google y los datos se guardan en tu proyecto de Firebase. Los ves igual desde cualquier equipo. Cada cuenta solo puede leer y escribir sus propios datos (ver `firestore.rules`).
- **Sin Firebase** («modo local»): los datos se guardan solo en ese navegador. Sirve para probar. Haz copias en *Calendario y horas › Copia de seguridad*.

Los datos **nunca** se guardan en este repositorio: aquí solo está el código.

## Puesta en marcha de Firebase (una sola vez, unos 10 minutos)

1. Entra en <https://console.firebase.google.com> con tu cuenta de Google y pulsa **Crear un proyecto**. Ponle un nombre (por ejemplo `cuadrante-docente`). Google Analytics no hace falta.
2. **Inicio de sesión con Google**: en el menú, *Compilación › Authentication › Comenzar*. En *Método de acceso*, elige **Google**, actívalo, elige tu correo de asistencia y guarda.
3. **Dominio autorizado**: en *Authentication › Configuración › Dominios autorizados*, pulsa *Agregar dominio* y añade `samukftv.github.io`.
4. **Base de datos**: *Compilación › Firestore Database › Crear base de datos*. Ubicación en Europa (por ejemplo `europe-southwest1`, Madrid) y **modo de producción**.
5. **Reglas**: en la pestaña *Reglas* de Firestore, borra lo que haya, pega el contenido de [`firestore.rules`](firestore.rules) y pulsa *Publicar*.
   - Opcional: para que solo tu cuenta pueda entrar, cambia la condición por
     `request.auth != null && request.auth.uid == uid && request.auth.token.email == "TU_CORREO"`.
6. **Datos de conexión**: en ⚙ *Configuración del proyecto › General › Tus apps*, pulsa el icono web `</>`, registra la app (sin Hosting) y copia el bloque `firebaseConfig`.
7. Pega esos valores en [`js/firebase-config.js`](js/firebase-config.js), en lugar de `null`. Puedes editarlo desde la web de GitHub (icono del lápiz) y guardar con *Commit changes*. En un minuto la web se actualiza.

Los valores de `firebaseConfig` no son secretos: lo que protege los datos son las reglas del paso 5.

## Pasar los datos que ya tenías

1. Abre la app y entra con Google.
2. Ve a *Calendario y horas › Copia de seguridad › Importar copia…* y elige el archivo `.json` de tu copia.

Importar una copia sustituye todos los datos de tu cuenta.

## Uso diario

- **Horario por docente**: elige el docente y la semana. Arriba eliges qué añadir (Guardia, Tutoría, Reunión…) y hasta qué semana; pulsa las horas libres para ponerlo. Pulsa una ocupación para cambiarla o quitarla.
- **Grupos y módulos**: cuando cambie la rotación, ajusta las fechas o el docente del módulo. La tira de sesiones te enseña si queda algún hueco.
- **Avisos**: revísalo cada semana.
- Haz una copia de seguridad de vez en cuando (*Calendario y horas › Copia de seguridad › Descargar copia*).

## Estructura

```
index.html               página principal
css/estilos.css          estilos
js/app.js                la aplicación (motor de cálculo + interfaz)
js/firebase-config.js    configuración de tu proyecto de Firebase
js/vendor/               librerías incluidas (Preact + htm, Firebase)
firestore.rules          reglas de seguridad de la base de datos
sw.js                    funcionamiento sin conexión
manifest.webmanifest     instalación como aplicación
```

No hace falta compilar nada: son archivos estáticos que sirve GitHub Pages.

## Licencias de terceros

- [Preact](https://preactjs.com) + [htm](https://github.com/developit/htm) (`js/vendor/htm-preact-standalone.umd.js`): licencia Apache-2.0 / MIT.
- [Firebase JavaScript SDK](https://github.com/firebase/firebase-js-sdk) 10.12.2 (`js/vendor/firebase-*-compat.js`): licencia Apache-2.0.
