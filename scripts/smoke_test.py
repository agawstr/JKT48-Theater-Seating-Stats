name: Smoke test

# Tangkap file JS yang salah (mis. app.js tertimpa admin.html) dan halaman index yang rusak
# SEBELUM terlihat pengunjung. Tidak mengubah/commit apa pun.
on:
  push:
    branches: [main]
    paths: ['*.html', 'sw.js', 'data.json', 'assets/**', 'scripts/**', '.github/workflows/smoke-test.yml']
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Cek JS (bukan HTML nyasar, syntax valid)
        run: python scripts/check_js.py
      - name: Pasang Playwright
        run: |
          pip install playwright
          playwright install chromium
      - name: Smoke test index.html
        run: python scripts/smoke_test.py
      - name: Tes fitur lineup (statistik, filter, admin)
        run: python scripts/lineup_test.py
