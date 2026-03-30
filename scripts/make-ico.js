const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const pngToIco = require('png-to-ico')

const OUT_DIR = path.resolve(__dirname, '..', 'build')
const OUT_ICO = path.join(OUT_DIR, 'qr.ico')

const CANDIDATES = [
  path.join(OUT_DIR, 'logo.png'),
  path.join(OUT_DIR, 'logo.jpg'),
  path.join(OUT_DIR, 'logo.jpeg'),
  path.join(OUT_DIR, 'qr.png'),
  path.join(OUT_DIR, 'qr.jpg'),
  path.join(OUT_DIR, 'qr.jpeg')
]

const SIZES = [16, 32, 48, 64, 128, 256]

async function main() {
  try {
    let SRC = null
    for (const c of CANDIDATES) {
      if (fs.existsSync(c)) {
        SRC = c
        break
      }
    }
    if (!SRC) throw new Error(`no source logo found; checked: ${CANDIDATES.join(', ')}`)

    // Generate a single 256x256 PNG buffer and feed into png-to-ico
    const png256 = await sharp(SRC).resize(256, 256, { fit: 'cover' }).png().toBuffer()
    const icoBuffer = await pngToIco(png256)
    fs.writeFileSync(OUT_ICO, icoBuffer)
    console.log('Created', OUT_ICO, 'from', SRC)
  } catch (e) {
    console.error('Failed to create ico:', e)
    process.exitCode = 1
  }
}

main()
