import fs from "node:fs"

const [sourcePath, targetPath] = process.argv.slice(2)
if (!sourcePath || !targetPath) throw new Error("Usage: node merge-glb-node-extras.mjs source.glb target.glb")

const readGlb = path => {
  const buffer = fs.readFileSync(path)
  if (buffer.toString("utf8", 0, 4) !== "glTF") throw new Error(`${path} is not GLB`)
  const chunks = []
  let offset = 12
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset)
    const type = buffer.toString("utf8", offset + 4, offset + 8)
    chunks.push({type, data: buffer.subarray(offset + 8, offset + 8 + length)})
    offset += 8 + length
  }
  return {version: buffer.readUInt32LE(4), chunks, json: JSON.parse(chunks.find(chunk => chunk.type === "JSON").data.toString("utf8"))}
}

const source = readGlb(sourcePath)
const target = readGlb(targetPath)
const sourceByName = new Map((source.json.nodes || []).filter(node => node.name).map(node => [node.name, node]))
for (const node of target.json.nodes || []) {
  const original = sourceByName.get(node.name)
  if (original?.extras) node.extras = structuredClone(original.extras)
}

const jsonData = Buffer.from(JSON.stringify(target.json), "utf8")
const paddedJson = Buffer.concat([jsonData, Buffer.alloc((4 - (jsonData.length % 4)) % 4, 0x20)])
const jsonChunk = Buffer.alloc(8 + paddedJson.length)
jsonChunk.writeUInt32LE(paddedJson.length, 0)
jsonChunk.write("JSON", 4, 4, "utf8")
paddedJson.copy(jsonChunk, 8)
const otherChunks = target.chunks.filter(chunk => chunk.type !== "JSON").map(chunk => {
  const out = Buffer.alloc(8 + chunk.data.length)
  out.writeUInt32LE(chunk.data.length, 0)
  out.write(chunk.type, 4, 4, "utf8")
  chunk.data.copy(out, 8)
  return out
})
const body = Buffer.concat([jsonChunk, ...otherChunks])
const header = Buffer.alloc(12)
header.write("glTF", 0, 4, "utf8")
header.writeUInt32LE(source.version, 4)
header.writeUInt32LE(header.length + body.length, 8)
fs.writeFileSync(targetPath, Buffer.concat([header, body]))
console.log(`Merged node extras from ${sourcePath} into ${targetPath}`)
