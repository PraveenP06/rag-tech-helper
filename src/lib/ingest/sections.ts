import { splitBlocks } from "./preprocess/fences";

export interface Section {
  /** Headings from the outermost down to this section's own heading; empty before the first heading. */
  headingPath: string[];
  /** Level of the section's own heading (1–6), or 0 for text before the first heading. */
  level: number;
  body: string;
}

const HEADING = /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;

/** Splits markdown at ATX headings (`#`–`######`), ignoring `#` lines inside code. Empty sections are dropped. */
export function splitSections(markdown: string): Section[] {
  const sections: Section[] = [];
  const stack: Array<{ level: number; text: string }> = [];
  let current = { headingPath: [] as string[], level: 0, lines: [] as string[] };

  const finish = () => {
    const body = current.lines.join("\n").replace(/^\n+|\s+$/g, "");
    if (body) sections.push({ headingPath: current.headingPath, level: current.level, body });
  };

  for (const block of splitBlocks(markdown)) {
    if (block.code) {
      current.lines.push(block.text);
      continue;
    }
    for (const line of block.text.split("\n")) {
      const heading = HEADING.exec(line);
      if (!heading) {
        current.lines.push(line);
        continue;
      }
      finish();
      const level = heading[1].length;
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      stack.push({ level, text: heading[2].trim() });
      current = { headingPath: stack.map((h) => h.text), level, lines: [] };
    }
  }
  finish();
  return sections;
}
