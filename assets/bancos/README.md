# Logos de bancos

Guarda aquí el logo de cada banco como **`<codigo>.png`** (fondo transparente o
blanco, cuadrado idealmente). El código es el de SUDEBAN (4 dígitos).

Cuando el archivo exista, se agrega su línea en
`src/components/LogoBanco.tsx` (mapa `LOGOS`), p. ej.:

```ts
'0102': require('../../assets/bancos/0102.png'),
```

Si un banco no tiene imagen, el app usa una insignia con color de marca + siglas.

## Nombres de archivo esperados

| Archivo    | Banco                              |
|------------|------------------------------------|
| 0102.png   | Banco de Venezuela (BDV)           |
| 0105.png   | Mercantil                          |
| 0108.png   | BBVA Provincial                    |
| 0114.png   | Bancaribe                          |
| 0115.png   | Banco Exterior                     |
| 0128.png   | Banco Caroní                       |
| 0134.png   | Banesco                            |
| 0137.png   | Banco Sofitasa                     |
| 0138.png   | Banco Plaza                        |
| 0151.png   | BFC Banco Fondo Común              |
| 0156.png   | 100% Banco                         |
| 0168.png   | Bancrecer                          |
| 0172.png   | Bancamiga                          |
| 0177.png   | BANFANB                            |
| 0178.png   | N58 Banco Digital                  |
| 0191.png   | BNC (Banco Nacional de Crédito)    |

> Bancos sin código confirmado en el registro (indícame el código SUDEBAN para
> mapearlos): **BDT — Banco Digital de los Trabajadores**, **R4**.
