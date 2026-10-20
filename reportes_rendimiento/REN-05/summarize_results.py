"""Convierte los CSV de Locust REN-05 en una tabla Markdown verificable."""

from __future__ import annotations

import csv
import sys
from pathlib import Path


def value(row: dict[str, str], key: str) -> str:
    return row.get(key, row.get(key.replace(" ", "_"), ""))


def main(results_dir: Path) -> None:
    rows: list[dict[str, str]] = []
    for stats_path in sorted(results_dir.glob("*_stats.csv")):
        if stats_path.name.endswith("_stats_history.csv"):
            continue
        with stats_path.open(encoding="utf-8-sig", newline="") as stats_file:
            for row in csv.DictReader(stats_file):
                if value(row, "Name") == "Aggregated":
                    continue
                count = int(float(value(row, "Request Count") or 0))
                if count == 0:
                    continue
                failures = int(float(value(row, "Failure Count") or 0))
                stem = stats_path.name.removesuffix("_stats.csv")
                endpoint, users = stem.rsplit("_u", 1)
                rows.append({
                    "endpoint": endpoint.replace("-", "/"),
                    "users": users,
                    "requests": str(count),
                    "failures": str(failures),
                    "failure_rate": f"{failures / count * 100:.2f}%",
                    "average": f"{float(value(row, 'Average Response Time')):.2f}",
                    "p90": f"{float(value(row, '90%')):.2f}",
                    "p95": f"{float(value(row, '95%')):.2f}",
                    "rps": f"{float(value(row, 'Requests/s')):.2f}",
                    "minimum": f"{float(value(row, 'Min Response Time')):.2f}",
                    "maximum": f"{float(value(row, 'Max Response Time')):.2f}",
                })

    output = results_dir / "results.md"
    with output.open("w", encoding="utf-8", newline="\n") as report:
        report.write("# REN-05 — Resultados de rendimiento\n\n")
        report.write("Las latencias están en milisegundos. Cada fila corresponde a 30 segundos de carga HTTP real con un endpoint GET público y sólo de lectura.\n\n")
        report.write("| Endpoint | Usuarios | Solicitudes | Errores | Error % | Promedio (ms) | p90 (ms) | p95 (ms) | RPS | Mín. (ms) | Máx. (ms) | p95 ≤ 2500 ms |\n")
        report.write("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|\n")
        for row in rows:
            approved = "Sí" if float(row["p95"]) <= 2500 and row["failures"] == "0" else "No"
            report.write(
                f"| {row['endpoint']} | {row['users']} | {row['requests']} | {row['failures']} | {row['failure_rate']} | "
                f"{row['average']} | {row['p90']} | {row['p95']} | {row['rps']} | {row['minimum']} | {row['maximum']} | {approved} |\n"
            )
        report.write("\n**Criterio REN-05:** p95 ≤ 2500 ms y ausencia de errores HTTP en cada escenario.\n")
        if len(rows) != 6:
            report.write("\n**Estado:** BLOQUEADA / no evaluable: faltan escenarios o artefactos CSV.\n")
        elif all(float(row["p95"]) <= 2500 and row["failures"] == "0" for row in rows):
            report.write("\n**Conclusión:** APROBADA según la evidencia de estas seis ejecuciones locales aisladas.\n")
        else:
            report.write("\n**Conclusión:** RECHAZADA según la evidencia de estas seis ejecuciones locales aisladas.\n")

    print(output)


if __name__ == "__main__":
    main(Path(sys.argv[1]).resolve())