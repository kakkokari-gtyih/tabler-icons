import outlineStroke from 'svg-outline-stroke'
import { asyncForEach, getAllIcons, getCompileOptions, getPackageDir, HOME_DIR } from '../../../.build/helpers.mjs'
import fs from 'fs'
import { resolve, basename } from 'path'
import crypto from 'crypto'
import { glob } from 'glob'
import { execSync } from 'child_process'
import { execa } from 'execa'

const DIR = getPackageDir('icons-webfont')

const strokes = {
  200: 1,
  300: 1.5,
  400: 2,
}

const buildOutline = async () => {
  let filesList = {}
  const icons = getAllIcons(true)

  const compileOptions = getCompileOptions()

  for (const strokeName in strokes) {
    const stroke = strokes[strokeName]

    await asyncForEach(Object.entries(icons), async ([type, icons]) => {
      fs.mkdirSync(resolve(DIR, `icons-outlined/${strokeName}/${type}/new`), { recursive: true })
      filesList[type] = []

      await asyncForEach(icons, async function ({ name, unicode, content }) {
        console.log(type, name);

        if (compileOptions.includeIcons.length === 0 || compileOptions.includeIcons.indexOf(name) >= 0) {

          if (unicode) {
            console.log(`Stroke ${strokeName} for:`, name, unicode)

            let filename = `${name}.svg`
            if (unicode) {
              filename = `u${unicode.toUpperCase()}-${name}.svg`
            }

            filesList[type].push(filename)

            content = content
              .replace('width="24"', 'width="1000"')
              .replace('height="24"', 'height="1000"')

            content = content
              .replace('stroke-width="2"', `stroke-width="${stroke}"`)

            const cachedFilename = `u${unicode.toUpperCase()}-${name}.svg`;

            if (unicode && fs.existsSync(resolve(DIR, `icons-outlined/${strokeName}/${type}/${cachedFilename}`))) {
              // Get content
              let cachedContent = fs.readFileSync(resolve(DIR, `icons-outlined/${strokeName}/${type}/${cachedFilename}`), 'utf-8')

              // Get hash
              let cachedHash = '';
              cachedContent = cachedContent.replace(/<!--\!cache:([a-z0-9]+)-->/, function (m, hash) {
                cachedHash = hash;
                return '';
              })

              // Check hash
              if (crypto.createHash('sha1').update(cachedContent).digest("hex") === cachedHash) {
                console.log('Cached completed stroke for:', name, unicode)
                return true;
              }
            }

            if (unicode && fs.existsSync(resolve(DIR, `icons-outlined/${strokeName}/${type}/new/${cachedFilename}`))) {
              console.log('Cached outlined stroke for:', name, unicode)
              return true;
            }

            await outlineStroke(content, {
              optCurve: true,
              steps: 4,
              round: 0,
              centerHorizontally: true,
              fixedWidth: false,
              color: 'black'
            }).then(outlined => {
              // Save file
              fs.writeFileSync(resolve(DIR, `icons-outlined/${strokeName}/${type}/new/${filename}`), outlined, 'utf-8')
              console.log('Created stroke for:', name, unicode)
            }).catch(error => console.log(error))
          }
        }
      })

      // Process for new files
      // Fix outline
      if (
        fs.existsSync(resolve(DIR, `icons-outlined/${strokeName}/${type}/new`)) &&
        (await glob(resolve(DIR, `icons-outlined/${strokeName}/${type}/new/*.svg`))).length > 0
      ) {
        await execa('fontforge', ['-quiet', '-lang=py', '-script', '.build/fix-outline.py', resolve(DIR, `icons-outlined/${strokeName}/${type}/new`)], {
          stdout: process.stdout,
          stderr: process.stderr,
        });
        await execa('pnpm', ['dlx', 'svgo', resolve(DIR, `icons-outlined/${strokeName}/${type}/new`)], {
          stdout: process.stdout,
          stderr: process.stderr,
        });

        // Add hash
        await asyncForEach((await glob(resolve(DIR, `icons-outlined/${strokeName}/${type}/new/*.svg`))), async (dir) => {
          const filename = basename(dir)
          const fixedFileContent = fs
            .readFileSync(resolve(DIR, `icons-outlined/${strokeName}/${type}/new/${filename}`), 'utf-8')
            .replace(/\n/g, ' ')
            .trim();
          const hashString = `<!--!cache:${crypto.createHash('sha1').update(fixedFileContent).digest("hex")}-->`

          // Save file
          fs.writeFileSync(
            resolve(DIR, `icons-outlined/${strokeName}/${type}/${filename}`),
            fixedFileContent + hashString,
            'utf-8'
          )
        })
      }

      // Remove new directory
      execSync(`rm -rf icons-outlined/${strokeName}/${type}/new`)
    })

    // Remove old files
    await asyncForEach(Object.entries(icons), async ([type, icons]) => {
      const existedFiles = (await glob(resolve(DIR, `icons-outlined/${strokeName}/${type}/*.svg`))).map(file => basename(file))
      existedFiles.forEach(file => {
        if (filesList[type].indexOf(file) === -1) {
          console.log('Remove:', file)
          fs.unlinkSync(resolve(DIR, `icons-outlined/${strokeName}/${type}/${file}`))
        }
      })
    })

    // Copy icons from firs to all directory
    await asyncForEach(Object.entries(icons), async ([type, icons]) => {
      fs.mkdirSync(resolve(DIR, `icons-outlined/${strokeName}/all`), { recursive: true })

      await asyncForEach(icons, async function ({ name, unicode }) {
        const iconName = `u${unicode.toUpperCase()}-${name}`

        if (fs.existsSync(resolve(DIR, `icons-outlined/${strokeName}/${type}/${iconName}.svg`))) {
          // Copy file
          console.log(`Copy ${iconName} to all directory`)

          fs.copyFileSync(
            resolve(DIR, `icons-outlined/${strokeName}/${type}/${iconName}.svg`),
            resolve(DIR, `icons-outlined/${strokeName}/all/${iconName}${type !== 'outline' ? `-${type}` : ''}.svg`)
          )
        }
      })
    })
  }

  console.log('Done')
}

await buildOutline()
