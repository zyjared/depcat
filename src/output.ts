import pc from 'picocolors';

export function printCatalogCount(count: number): void {
  console.log(`\n  ${pc.dim(`${count} catalog entries`)}\n`);
}

export function printFile(rel: string, count: number, ok: boolean): void {
  const icon = ok ? pc.green('✓') : pc.red('✗');
  const refs = count === 1 ? '1 ref' : `${count} refs`;
  const detail = ok ? pc.dim(refs) : pc.red(refs);
  console.log(`  ${icon} ${rel}  ${detail}`);
}

export function printAllInSync(): void {
  console.log(
    `\n  ${pc.green('✓')} ${pc.bold('All catalog references are in sync')}\n`,
  );
}

export function printSyncDone(files: number, refs: number): void {
  const f = pc.bold(String(files));
  const r = pc.bold(String(refs));
  console.log(
    `\n  ${f} ${files === 1 ? 'file' : 'files'} updated  ${pc.dim('·')}  ${r} refs synced`,
  );
}

export function printCheckFailed(files: number, refs: number): void {
  const f = pc.red(pc.bold(String(files)));
  const r = pc.red(String(refs));
  console.log(
    `\n  ${f} ${files === 1 ? 'file' : 'files'} out of sync  ${pc.dim('·')}  ${r} refs need updating`,
  );
}

export function printHint(msg: string): void {
  console.log(`  ${pc.dim(`→ ${msg}`)}\n`);
}

export function printSkipped(
  entries: Array<{
    name: string;
    refs: Array<{ ref: string; version: string }>;
  }>,
): void {
  if (entries.length === 0) return;
  console.log(
    `\n  ${pc.yellow('!')} ${pc.bold(`${entries.length} package${entries.length === 1 ? '' : 's'} skipped`)} — found in multiple catalogs:\n`,
  );
  for (const { name, refs } of entries) {
    const options = refs
      .map((r) => `${pc.dim(r.ref)}  ${pc.dim(r.version)}`)
      .join('  ·  ');
    console.log(`    ${pc.bold(name)}  ${options}`);
  }
  console.log();
}
