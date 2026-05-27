import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = new URL("..", import.meta.url).pathname;
const proofDir = join(root, "artifacts/auth-redirect-proof");
const frames = JSON.parse(await readFile(join(proofDir, "frames.json"), "utf8"));
const annotatedDir = join(proofDir, "annotated");
const font = "/System/Library/Fonts/Supplemental/Arial Bold.ttf";
const output = join(proofDir, "myfenrir-auth-redirect-proof.mp4");

await mkdir(annotatedDir, { recursive: true });

for (const frame of frames) {
  const textFile = join(annotatedDir, `frame-${String(frame.num).padStart(2, "0")}.txt`);
  const route = new URL(frame.url).pathname + new URL(frame.url).search;
  await writeFile(
    textFile,
    [
      frame.label,
      `Current route: ${route}`,
      frame.expected
    ].join("\n")
  );

  const annotated = join(annotatedDir, `frame-${String(frame.num).padStart(2, "0")}.png`);
  run("ffmpeg", [
    "-y",
    "-i", frame.file,
    "-vf",
    [
      "scale=1280:720:force_original_aspect_ratio=decrease",
      "pad=1280:720:(ow-iw)/2:(oh-ih)/2",
      "drawbox=x=24:y=24:w=1232:h=158:color=black@0.76:t=fill",
      `drawtext=fontfile='${font}':textfile='${textFile}':x=44:y=42:fontsize=28:fontcolor=white:line_spacing=9`
    ].join(","),
    "-frames:v", "1",
    annotated
  ]);
}

const listFile = join(proofDir, "concat.txt");
await writeFile(
  listFile,
  frames.map((frame) => {
    const annotated = join(annotatedDir, `frame-${String(frame.num).padStart(2, "0")}.png`);
    return `file '${annotated}'\nduration 2.4`;
  }).join("\n") + `\nfile '${join(annotatedDir, `frame-${String(frames.at(-1).num).padStart(2, "0")}.png`)}'\n`
);

run("ffmpeg", [
  "-y",
  "-f", "concat",
  "-safe", "0",
  "-i", listFile,
  "-vf", "format=yuv420p",
  "-movflags", "+faststart",
  output
]);

console.log(output);

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} failed\n${result.stderr || result.stdout}`);
  }
}
