# WITS style-trial variants

Three presentation variants of the same frozen WITS brief/content (baseline:
`spikes/refero-baseline/`). Each `site/` needs the baseline images copied in
before serving:

    cp -R spikes/refero-baseline/site/img spikes/wits-variants/<variant>/site/img

Serve with `python3 -m http.server <port> --bind 127.0.0.1` from the site dir.
Each variant carries its outside-model audit under `<variant>/audit/`.
