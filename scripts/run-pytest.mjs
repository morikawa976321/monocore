/**
 * `npm test` から scraper/ の pytest を回す（2026-10-07追加）。
 *
 * venv の python は Windows なら `.venv/Scripts`、Linux なら `.venv/bin` にある。
 * venv が無いときは黙って飛ばさず失敗させる: 飛ばすと pytest が誰にも回されない状態に戻る。
 */
/* global process */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scraperDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'scraper')
const python = [
    join(scraperDir, '.venv', 'Scripts', 'python.exe'),
    join(scraperDir, '.venv', 'bin', 'python'),
].find((candidate) => existsSync(candidate))

if (!python) {
    console.error(
        'scraper/.venv が無いため pytest を回せません。scraper/ で venv を作り requirements-dev.txt を入れてください。'
    )
    process.exit(1)
}

const result = spawnSync(python, ['-m', 'pytest', '-q'], { cwd: scraperDir, stdio: 'inherit' })
process.exit(result.status ?? 1)
