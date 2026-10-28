# Artifacts

Two pages built on claude.ai. The code for each is saved here so the pages can be rebuilt if the links stop working.

| File | Live page | What it shows |
| --- | --- | --- |
| [snapshot-dashboard.html](snapshot-dashboard.html) | https://claude.ai/artifact/1KJoDsygR95xDTkuCN2dwU | The snapshot by artist category and borough, opportunity types, and every listing with a filter and a link to the source |
| [source-coverage.html](source-coverage.html) | https://claude.ai/artifact/HG3uL34umsY8VpDgYZjACG | Every site crawled and the opportunities it gave, plus a checklist of blocked sites to screenshot |

## Opening them

- **source-coverage.html** is a self-contained page. Open it in a browser.
- **snapshot-dashboard.html** is the page body of a claude.ai Dashboard. It reads its data through that runtime (`dash.data`, `dash.calc`), so it does not run on its own. The data it reads is `data/snapshot.json`, uploaded to the artifact.

## Updating the dashboard's data

After a backfill run, upload `data/snapshot.json` to the dashboard and point its `opportunities` dataset at the new file.
