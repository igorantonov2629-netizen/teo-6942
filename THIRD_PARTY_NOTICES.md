## City directory

`packages/web/src/shared/cities.json` is derived from the `city` and
`region_name` columns of **1117 Russian cities with city name, region,
geographic coordinates and 2020 population estimate**, version 0.4.0 (2021).

Authors: Evgeniy Pogrebnyak and Kirill Artemov.
Source: https://doi.org/10.5281/zenodo.5151423
Data file: https://zenodo.org/api/records/5151423/files/towns.csv/content
License: Creative Commons Attribution 4.0 International (CC BY 4.0).
License terms: https://creativecommons.org/licenses/by/4.0/

Changes: only city/region labels retained, renamed to `name` / `region`,
converted from CSV to JSON. Directory is not a statement of CDEK coverage
and does not list pickup points. Availability and user-entered pickup
addresses require manual confirmation by a moderator.