#!/usr/bin/env python3
"""Importa Movimientos de un PBIX a una base de referencia para conciliación."""

from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

try:
    from pbixray import PBIXRay
except ImportError as exc:  # pragma: no cover - ayuda de instalación para uso manual
    raise SystemExit(
        "Falta pbixray. Instalalo en un entorno virtual con: pip install pbixray==0.15.1"
    ) from exc


COLUMNS = {
    "FechaComprobante": "sale_date",
    "Producto": "product_id",
    "Descripcion": "product_name",
    "Cliente": "client_name",
    "ClienteID": "client_id",
    "Marca": "brand",
    "Linea": "line",
    "Rubro": "category",
    "Subrubro": "subcategory",
    "Familia": "family",
    "Unidad": "units",
    "Kilos": "kilos",
    "ElImporteNeto": "net_amount",
    "Zona": "zone",
    "Agrupacion": "grouping_name",
    "TipoDeCliente": "client_type",
    "GrupoArtDescrip": "product_group",
    "CanaldeVentaDescrip": "channel",
    "Domicilio": "address",
    "EmpresaID": "company_id",
    "EstadoClienteDescripcion": "client_status",
    "SucursalNombre": "branch_name",
    "LocalidadDescrip": "locality",
    "Serie": "series",
    "PuntoDeVentaID": "point_of_sale_id",
    "Numero": "invoice_number",
    "NombreVendSucursal": "branch_seller",
    "Vendedor": "seller",
}

FILTER_OPTIONS = {
    "seller": "seller",
    "brand": "brand",
    "productGroup": "product_group",
    "channel": "channel",
    "product": "product_name",
    "client": "client_name",
    "line": "line",
    "category": "category",
    "subcategory": "subcategory",
    "clientType": "client_type",
    "grouping": "grouping_name",
    "locality": "locality",
}


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pbix", type=Path, help="Archivo .pbix a importar")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/reference/spt-pbix.sqlite"),
        help="Base SQLite de referencia (predeterminado: data/reference/spt-pbix.sqlite)",
    )
    return parser.parse_args()


def main() -> None:
    args = arguments()
    source = args.pbix.expanduser().resolve()
    output = args.output.expanduser().resolve()
    if not source.is_file():
        raise SystemExit(f"No existe el PBIX: {source}")

    model = PBIXRay(str(source))
    movements = model.get_table("Movimientos")
    missing = [name for name in COLUMNS if name not in movements.columns]
    if missing:
        raise SystemExit(f"El PBIX no contiene las columnas requeridas: {', '.join(missing)}")

    frame = movements[list(COLUMNS)].rename(columns=COLUMNS).copy()
    frame["sale_date"] = frame["sale_date"].dt.strftime("%Y-%m-%d")
    for column in (
        "product_id", "product_name", "client_name", "brand", "line", "category",
        "subcategory", "family", "zone", "grouping_name", "client_type",
        "product_group", "channel", "address", "client_status", "branch_name",
        "locality", "series", "branch_seller", "seller",
    ):
        frame[column] = frame[column].astype("string").fillna("").str.strip()

    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(f"{output.suffix}.tmp")
    temporary.unlink(missing_ok=True)
    with sqlite3.connect(temporary) as database:
        database.execute("PRAGMA journal_mode = OFF")
        database.execute("PRAGMA synchronous = OFF")
        frame.to_sql("movements", database, if_exists="replace", index=False, chunksize=5000)
        database.executescript(
            """
            CREATE INDEX idx_spt_date ON movements(sale_date);
            CREATE INDEX idx_spt_company_date ON movements(company_id, sale_date);
            CREATE INDEX idx_spt_seller_date ON movements(seller, sale_date);
            CREATE INDEX idx_spt_group_date ON movements(product_group, sale_date);
            CREATE INDEX idx_spt_channel_date ON movements(channel, sale_date);
            CREATE INDEX idx_spt_product ON movements(product_id);
            CREATE INDEX idx_spt_client ON movements(client_id);
            CREATE TABLE report_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE filter_options (
              filter_key TEXT NOT NULL,
              value TEXT NOT NULL,
              PRIMARY KEY(filter_key, value)
            );
            """
        )
        option_frame = frame[frame["company_id"].eq(3) & frame["branch_id"].eq(3)]
        filter_rows = []
        for key, column in FILTER_OPTIONS.items():
            values = set(str(value) for value in option_frame[column].dropna().unique() if str(value).strip())
            if key == "seller":
                values.update(str(value) for value in option_frame["branch_seller"].dropna().unique() if str(value).strip())
            filter_rows.extend((key, value) for value in sorted(values, key=str.casefold))
        database.executemany("INSERT INTO filter_options(filter_key, value) VALUES (?, ?)", filter_rows)
        metadata = {
            "source_file": source.name,
            "row_count": str(len(frame)),
            "min_date": str(frame["sale_date"].min()),
            "max_date": str(frame["sale_date"].max()),
            "source_system": "Power BI · referencia histórica, no operativa",
            "source_kind": "pbix_reference",
        }
        database.executemany("INSERT INTO report_meta(key, value) VALUES (?, ?)", metadata.items())
        database.execute("ANALYZE")
        database.commit()

    temporary.replace(output)
    print(f"Importación SPT completa: {len(frame):,} movimientos")
    print(f"Cobertura: {frame['sale_date'].min()} a {frame['sale_date'].max()}")
    print(f"Destino: {output}")


if __name__ == "__main__":
    main()
