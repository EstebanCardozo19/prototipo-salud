# REN-05 — Resultados de rendimiento

Las latencias están en milisegundos. Cada fila corresponde a 30 segundos de carga HTTP real con un endpoint GET público y sólo de lectura.

| Endpoint | Usuarios | Solicitudes | Errores | Error % | Promedio (ms) | p90 (ms) | p95 (ms) | RPS | Mín. (ms) | Máx. (ms) | p95 ≤ 2500 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| api/caregivers | 10 | 1371 | 0 | 0.00% | 7.69 | 10.00 | 11.00 | 47.12 | 3.67 | 75.63 | Sí |
| api/caregivers | 1 | 136 | 0 | 0.00% | 6.64 | 8.00 | 9.00 | 4.70 | 5.22 | 15.39 | Sí |
| api/caregivers | 5 | 685 | 0 | 0.00% | 7.26 | 8.00 | 9.00 | 23.54 | 3.78 | 130.09 | Sí |
| api/nurses | 10 | 1357 | 0 | 0.00% | 6.65 | 8.00 | 9.00 | 46.56 | 3.68 | 42.26 | Sí |
| api/nurses | 1 | 138 | 0 | 0.00% | 6.86 | 8.00 | 10.00 | 4.76 | 5.09 | 30.82 | Sí |
| api/nurses | 5 | 676 | 0 | 0.00% | 6.35 | 8.00 | 9.00 | 23.22 | 3.53 | 23.28 | Sí |

**Criterio REN-05:** p95 ≤ 2500 ms y ausencia de errores HTTP en cada escenario.

**Conclusión:** APROBADA según la evidencia de estas seis ejecuciones locales aisladas.
