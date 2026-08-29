# Diagnóstico: Onboarding KYC Persona Natural vs. especificación (Onboarding.excalidraw)

Comparación entre el diagrama que pasaste (7 pasos: Autenticación Biométrica → Identificación → Contacto → Actividad Económica → Perfil financiero → PEP y Bancos → Documentos) y lo que ya existe en `src/pages/Onboarding.tsx` + `supabase/functions/onboarding/index.ts` + tabla `onboarding_pn`.

Hoy el flujo real tiene **6 pasos**, no 7 — falta el paso de biometría completo, y los otros 6 necesitan ajustes puntuales pero ya tienen la base construida (catálogos de Bepay, geografía DANE, subida de documentos, etc.).

---

## 1. Autenticación Biométrica — **no existe, hay que construirla desde cero**

Busqué "Didit"/"biometric"/"liveness" en todo el repo y no hay ningún resultado. No hay paso 0, no hay Edge Function, no hay columnas en la base de datos para esto.

**Falta:**
- Cuenta/API key de Didit (o el proveedor que uses) — dato que necesito que me des.
- Nueva Edge Function (`onboarding-biometric` o similar) que cree la sesión de verificación en Didit y reciba su webhook de resultado.
- Nuevas columnas en `onboarding_pn`: `biometric_session_id`, `biometric_status` (pending/verified/failed), `biometric_verified_at`, `biometric_provider_ref`.
- Nuevo paso 0 en `PN_STEPS` (hoy: `["Identificación", "Contacto", "Actividad y tributaria", "Financiera", "Cumplimiento y banco", "Documentos"]` — línea 175) con la UI que abre el flujo de Didit (SDK web o redirect) y bloquea el "Siguiente" hasta que el resultado sea `verified`.
- Decisión de negocio: ¿la biometría bloquea el resto del formulario (no se puede avanzar sin ella), o se puede completar el formulario y quedar pendiente de biometría? El diagrama la pone primera, lo que sugiere que bloquea.

---

## 2. Identificación (paso actual: `case 0`, líneas 808-868)

| Pedido en el diagrama | Estado actual | Gap |
|---|---|---|
| Quitar NIT, Tarjeta de Identidad, Registro de Nacimiento del tipo de documento | `documentTypes` sale directo del catálogo real de Bepay (`getDocumentTypes()`, línea 813) sin filtrar | Falta un filtro que excluya esos 3 tipos para este formulario (a diferencia de Beneficiarios, que sí se ajustó antes) |
| Quitar "Otros" de Sexo | `SEX_OPTIONS = ["Masculino", "Femenino", "Otro"]` (línea 203) | Quitar el tercer valor |
| Eliminar apartado Nacionalidad | Existe como campo independiente (línea 858, `CatalogSelect` "Nacionalidad") | Eliminar el campo (y su columna `nationality` puede quedar en la tabla sin usarse, o migrarse) |
| País de nacimiento + Departamento + Municipio conectados | País de nacimiento es un `CatalogSelect` de países de Bepay (línea 859); Departamento/Municipio nacimiento usan `GeoPicker` (línea 860-866) que **siempre** trae departamentos de Colombia (`useGeo()`, exclusivo Colombia) sin importar qué país se eligió arriba | El `GeoPicker` de nacimiento debe: (a) solo mostrarse si País de nacimiento = Colombia, (b) si no, ocultarse — hoy aparece siempre, desconectado del país seleccionado |
| Lista de países, departamentos y municipios reales | Países: catálogo real de Bepay ✅. Departamentos/municipios: `useGeo()` trae región/ciudad reales de Bepay ✅ | Esta parte ya está resuelta, solo falta conectarla condicionalmente al país (punto anterior) |
| Excluir Cuba, Irán, Corea del Norte, Siria, Rusia, Bielorrusia de la lista de países | Ningún filtro de este tipo existe en `toCatalogItems` (línea 118) ni en `useCatalogs` | Agregar lista de exclusión (por nombre, ya que Bepay devuelve `name`) aplicada a `countries` en el hook |

---

## 3. Contacto (paso actual: `case 1`, líneas 871-907)

| Pedido | Estado actual | Gap |
|---|---|---|
| País de residencia = solo Colombia | `CatalogSelect` con el catálogo completo de países de Bepay (línea 890) | Cambiar a un campo fijo/no editable "Colombia", o un select con una sola opción |
| Ciudad no activa el código DANE en la mayoría de los casos | `getDane()` (línea 40) busca en `DANE_BY_CITY`, un diccionario **hardcodeado de ~70 ciudades**. Colombia tiene ~1.100 municipios | Root cause confirmada: para cualquier municipio fuera de esas 70 ciudades grandes, `getDane()` devuelve `""` silenciosamente. Hace falta una fuente completa de códigos DANE por municipio (o que Bepay los devuelva directamente en `getColombiaGeo`, si su catálogo los trae — hay que revisar la respuesta cruda) |

---

## 4. Actividad Económica (paso actual: `case 2`, líneas 909-952)

| Pedido | Estado actual | Gap |
|---|---|---|
| Actividad económica con códigos CIIU + nombre, desde el Excel "Matriz Ciiu - Riesgo Nivel 5" | Para Persona Natural es un `<input>` de texto libre (línea 924-926, placeholder "Ej. Comercio, servicios..."). El flujo de Empresa **sí** ya usa un `CatalogInput` con `catalogs.ciiuCodes` (línea 1082-1083, trae CIIU real de Bepay) | Para PN: cambiar el input libre por el mismo patrón `CatalogInput` que usa Empresa. Pero ojo — el pedido menciona una matriz CIIU **con nivel de riesgo**, no el catálogo genérico de Bepay. **Necesito que me pases ese archivo Excel** para saber si trae códigos/riesgos que Bepay no tiene, y si hay que guardar también el nivel de riesgo por usuario (nueva columna `economic_activity_risk_level`) |
| Quitar "¿Trabaja de manera independiente o dependiente?" | Existe (línea 933, `tipoEmpleo`) | Eliminar el campo |
| Eliminar TODO el apartado de Información Tributaria | Sección completa existe (líneas 936-950): país residencia fiscal, residencia fiscal en otro país, TIN, RUT, régimen tributario, responsable IVA — con columnas ya en `onboarding_pn` (`tax_residence_country`, `has_foreign_tax_residence`, `tax_id_tin`, `rut_number`, `tax_regime`, `is_vat_responsible`, ver `onboarding/index.ts` líneas 107-112) | Quitar la sección completa del formulario. Las columnas en base de datos se pueden dejar sin usar (no rompe nada) en vez de borrarlas, por si se necesitan de nuevo |

---

## 5. Perfil financiero (paso actual: `case 3`, líneas 954-987)

Lo que ya existe (Ingresos y egresos, Origen y fuente de fondos, Perfil transaccional esperado) **coincide con el diagrama, no requiere cambios**.

**Falta agregar** el checklist nuevo que pide el diagrama, ninguno de estos 4 bloques existe hoy:
1. Tipo de operaciones (multi-select): Recaudo de fondos / Dispersión de fondos / FX Fiat→Fiat / FX Fiat→Cripto / FX Cripto→Fiat
2. Monedas a utilizar (multi-select): COP / USD
3. ¿Utiliza criptoactivos? (Sí/No)
4. Propósito principal (multi-select con "Otro" abierto): Pagos comerciales / Cobro de ventas / Pago a proveedores / Operaciones de tesorería / Conversión de monedas / Conversión fiat↔cripto / Inversión / Otro

Necesita: nuevas columnas en `onboarding_pn` (arrays o JSONB — `operation_types text[]`, `operation_currencies text[]`, `uses_crypto boolean`, `operation_purpose text[]`, `operation_purpose_other text`), nuevo componente de checklist (ya existe `DeclChecklist` como precedente de patrón multi-check, se puede adaptar).

---

## 6. PEP y Bancos (paso actual: `case 4`, líneas 989-1030) — **el cambio más grande de todos**

Hoy la sección bancaria es un formulario plano de un solo país/moneda: Banco (texto libre con catálogo), Tipo de cuenta (Ahorros/Corriente fijo), Número de cuenta, Titular, Tipo/número doc del titular, País de la cuenta (cualquier país de Bepay), Moneda (select simple COP/USD/EUR sin que cambie nada más).

El diagrama pide que sea **condicional según la moneda elegida**:
- **COP** → País: Colombia (fijo) → Banco (dropdown bancos colombianos) → Tipo de cuenta: Ahorro/Corriente
- **USD** → País: USA (fijo) → Banco (dropdown bancos USA) → Tipo de cuenta: Checking/Saving → Número de cuenta + **Routing Number**
- **EUR** → País: lista de países europeos con SEPA → Banco (dropdown) → **IBAN** + **Account Number** + **BIC/SWIFT**

**Gaps concretos:**
- La tabla `onboarding_pn` solo tiene `bank_account_number` (una sola columna genérica, ver `onboarding/index.ts` línea 130) — no hay campos para Routing Number, IBAN, ni BIC/SWIFT por separado. Meter esos 3 datos distintos en una sola columna es frágil (no se puede validar formato, ni saber cuál es cuál al leerlo después). Hacen falta columnas nuevas: `bank_routing_number`, `bank_iban`, `bank_swift_bic`.
- No hay ningún catálogo de bancos de Estados Unidos ni de bancos europeos — hoy `catalogs.banks` (línea 146, via `getBanks(200)`) trae bancos colombianos de Bepay. Si Bepay no tiene catálogo de bancos USA/Europa, hay que definir de dónde sale esa lista (¿catálogo propio hardcodeado? ¿otro proveedor?).
- No hay lista de "países europeos con SEPA" en el código — hay que agregarla (es una lista fija conocida, ~36 países SEPA).
- El campo Moneda no dispara ningún cambio condicional en la UI hoy — hay que reestructurar el bloque para que sea reactivo (como ya funciona el patrón `GeoPicker` con depto→ciudad, se puede replicar la misma idea moneda→país→banco→campos específicos).

---

## 7. Documentos (paso actual: `case 5`, líneas 1032-1050)

| Pedido | Estado actual | Gap |
|---|---|---|
| Agregar "Soporte de Residencia" (factura de servicios u otro documento) | No existe esa `UploadZone` | Agregar zona de carga nueva + columna `residence_proof_url` en `onboarding_pn` + en la Edge Function (`onboarding/index.ts` línea 148 es donde se guardan las demás URLs de documentos) |
| Renombrar "Extractos bancarios o Declaración de renta" → "Extractos bancarios o Declaración de impuesto" | Label literal en línea 1040 | Cambio de texto únicamente, sin tocar la columna (`bank_statement_or_tax_return_url` puede quedar igual) |

---

## Cosas transversales que afectan a varios pasos

1. **Filtro de tipos de documento** (Identificación y Titular de cuenta bancaria) — hoy usan el mismo catálogo `catalogs.documentTypes` sin filtrar. Si se filtra NIT/TI/RC para Identificación, hay que decidir si el filtro también aplica al "Tipo de documento del titular" de la cuenta bancaria (línea 1017-1018) — probablemente sí, por consistencia.
2. **Exclusión de países sancionados** (Cuba, Irán, Corea del Norte, Siria, Rusia, Bielorrusia) — si se agrega, debería aplicar a **todos** los `CatalogSelect` de país (nacionalidad si se mantiene, país de nacimiento, país de residencia, país de residencia fiscal si se mantiene, país de la cuenta bancaria), no solo a uno. Se resuelve en un solo lugar (`useCatalogs`, filtrando `countries` una vez).
3. **DANE completo** — si se corrige, beneficia tanto a Identificación (municipio expedición/nacimiento) como a Contacto (ciudad de residencia), porque los tres usan el mismo `GeoPicker`/`useGeo()`.

---

## Lo que necesito de tu lado antes de poder implementar todo

1. **Credenciales/documentación de la API de Didit** (o confirmar que es otro proveedor) para la biometría.
2. **El archivo Excel "Matriz Ciiu - Riesgo Nivel 5"** — para saber si el catálogo CIIU que ya trae Bepay alcanza, o si hay que cargar una tabla propia con niveles de riesgo.
3. **Origen del catálogo de bancos de Estados Unidos y de la Unión Europea** — Bepay no los tiene (solo bancos colombianos), así que hay que decidir la fuente.
4. **Confirmar si la biometría bloquea el avance del formulario** o si es independiente.
5. **Confirmar si el filtro de tipos de documento y de países sancionados debe aplicar también al flujo de Empresa** (el diagrama dice "Persona Natural" en el título, pero varias de estas reglas — sancionados, DANE — son lógicamente compartidas).

---

## Plan de implementación (orden sugerido)

**Fase 1 — Cambios de bajo riesgo, sin dependencias externas (se pueden hacer ya):**
1. Quitar "Otro" de Sexo, quitar Nacionalidad, quitar "independiente/dependiente", eliminar sección Información Tributaria completa.
2. Filtrar NIT/Tarjeta de Identidad/Registro de Nacimiento del tipo de documento.
3. Fijar País de residencia = Colombia.
4. Conectar GeoPicker de nacimiento a que solo aparezca si País de nacimiento = Colombia.
5. Agregar exclusión de países sancionados en `useCatalogs`.
6. Cambiar el label de "Extractos bancarios o Declaración de renta" y agregar la zona de "Soporte de Residencia" (+ migración de columna).
7. Migrar "Actividad económica" de PN de texto libre a `CatalogInput` con el catálogo CIIU que ya usa Empresa (versión provisional, hasta tener la matriz de riesgo).

**Fase 2 — Requiere datos tuyos:**
8. Checklist de Perfil financiero (tipo de operaciones, monedas, cripto, propósito) — no depende de nada externo, se puede hacer en paralelo a la Fase 1 en realidad, lo dejo en Fase 2 solo porque es la pieza más grande de UI nueva.
9. Códigos DANE completos (según qué fuente definamos).
10. Matriz CIIU con riesgo (cuando pases el Excel).

**Fase 3 — La más grande, con dependencias externas:**
11. Rediseño de la sección bancaria (moneda → país → banco → campos condicionales), con las columnas nuevas en base de datos.
12. Catálogos de bancos USA/Europa (cuando definamos la fuente).

**Fase 4 — Biometría (la pieza que no existe en absoluto):**
13. Integración completa con Didit: Edge Function, webhook, columnas, nuevo paso 0, lógica de bloqueo/desbloqueo del resto del formulario.

Puedo arrancar por la Fase 1 en cuanto me confirmes que sigo — no depende de nada que tengas que darme.
