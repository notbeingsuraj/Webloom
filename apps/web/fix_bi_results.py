import re

with open('src/pages/BusinessIntelligenceResults.tsx', 'r') as f:
    content = f.read()

replacements = [
    # Line 84-85
    ('className={`wl-shimmer h-12 w-3` + \'/\' + `4 rounded-lg`}', 'className={cls(\'wl-shimmer h-12 w-3\', frac(\'4\'))}'),
    ('className={`mt-4 wl-shimmer h-8 w-1` + \'/\' + `4 rounded-lg`}', 'className={cls(\'mt-4 wl-shimmer h-8 w-1\', frac(\'4\'))}'),
    # Line 98
    ('className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive` + \'/\' + `10 text-destructive`}', 'className={cls(\'mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive\', frac(\'10\'))}'),
    # Line 194
    ('className={`rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-primary` + \'/\' + `5 p-4`}', 'className={cls(\'rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-primary\', frac(\'5\'), \'p-4\')}'),
    # Line 198
    ('className={`rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-verified` + \'/\' + `5 p-4`}', 'className={cls(\'rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-verified\', frac(\'5\'), \'p-4\')}'),
    # Line 202
    ('className={`rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-danger` + \'/\' + `5 p-4`}', 'className={cls(\'rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-danger\', frac(\'5\'), \'p-4\')}'),
    # Line 206
    ('className={`rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-ai` + \'/\' + `5 p-4`}', 'className={cls(\'rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-ai\', frac(\'5\'), \'p-4\')}'),
    # Line 213
    ('className={`wl-card p-5 rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-secondary`', 'className={cls(\'wl-card p-5 rounded-2xl border border-border bg-gradient-to-br from-secondary via-card to-secondary\')}'),
    # Line 238
    ('className={`flex flex-wrap items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-card via-secondary` + \'/\' + `60 to-ai`}', 'className={cls(\'flex flex-wrap items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-card via-secondary\', frac(\'60\'), \'to-ai\')}'),
    # Line 269
    ('className={`flex items-start gap-4 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary`}', 'className={cls(\'flex items-start gap-4 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary\')}'),
    # Line 270
    ('className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-verified` + \'/\' + `12 text-verified`}', 'className={cls(\'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-verified\', frac(\'12\'), \'text-verified\')}'),
    # Line 371
    ('className={`wl-card p-5 border-danger` + \'/\' + `25 bg-danger${' + \'/\'} + `5`}', 'className={cls(\'wl-card p-5 border-danger\', frac(\'25\'), \'bg-danger\', frac(\'5\'))}'),
    # Line 376
    ('className={`mt-1 text-sm text-danger` + \'/\' + `80`}', 'className={cls(\'mt-1 text-sm text-danger\', frac(\'80\'))}'),
    # Line 388
    ('className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary` + \'/\' + `12 text-primary`}', 'className={cls(\'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary\', frac(\'12\'), \'text-primary\')}'),
    # Line 405
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-destructive` + \'/\' + `25 bg-destructive`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full border border-destructive\', frac(\'25\'), \'bg-destructive\')}'),
    # Line 415
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-warning` + \'/\' + `25 bg-warning`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full border border-warning\', frac(\'25\'), \'bg-warning\')}'),
    # Line 425
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold\')}'),
    # Line 434
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2\')}'),
    # Line 270 (duplicate)
    ('className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-verified` + \'/\' + `12 text-verified`}', 'className={cls(\'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-verified\', frac(\'12\'), \'text-verified\')}'),
    # Line 583
    ('className={`wl-card p-5 border-danger` + \'/\' + `25 bg-danger${' + \'/\'} + `5`}', 'className={cls(\'wl-card p-5 border-danger\', frac(\'25\'), \'bg-danger\', frac(\'5\'))}'),
    # Line 376
    ('className={`mt-1 text-sm text-danger` + \'/\' + `80`}', 'className={cls(\'mt-1 text-sm text-danger\', frac(\'80\'))}'),
    # Line 388
    ('className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary` + \'/\' + `12 text-primary`}', 'className={cls(\'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary\', frac(\'12\'), \'text-primary\')}'),
    # Line 405
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-destructive` + \'/\' + `25 bg-destructive`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full border border-destructive\', frac(\'25\'), \'bg-destructive\')}'),
    # Line 415
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-warning` + \'/\' + `25 bg-warning`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full border border-warning\', frac(\'25\'), \'bg-warning\')}'),
    # Line 425
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold\')}'),
    # Line 434
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2\')}'),
    # Line 270 (duplicate)
    ('className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-verified` + \'/\' + `12 text-verified`}', 'className={cls(\'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-verified\', frac(\'12\'), \'text-verified\')}'),
    # Line 583
    ('className={`wl-card p-5 border-danger` + \'/\' + `25 bg-danger${' + \'/\'} + `5`}', 'className={cls(\'wl-card p-5 border-danger\', frac(\'25\'), \'bg-danger\', frac(\'5\'))}'),
    # Line 376
    ('className={`mt-1 text-sm text-danger` + \'/\' + `80`}', 'className={cls(\'mt-1 text-sm text-danger\', frac(\'80\'))}'),
    # Line 388
    ('className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary` + \'/\' + `12 text-primary`}', 'className={cls(\'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary\', frac(\'12\'), \'text-primary\')}'),
    # Line 405
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-destructive` + \'/\' + `25 bg-destructive`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full border border-destructive\', frac(\'25\'), \'bg-destructive\')}'),
    # Line 415
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-warning` + \'/\' + `25 bg-warning`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full border border-warning\', frac(\'25\'), \'bg-warning\')}'),
    # Line 425
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold\')}'),
    # Line 434
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2\')}'),
    # Line 270 (duplicate)
    ('className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-verified` + \'/\' + `12 text-verified`}', 'className={cls(\'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-verified\', frac(\'12\'), \'text-verified\')}'),
    # Line 583
    ('className={`wl-card p-5 border-danger` + \'/\' + `25 bg-danger${' + \'/\'} + `5`}', 'className={cls(\'wl-card p-5 border-danger\', frac(\'25\'), \'bg-danger\', frac(\'5\'))}'),
    # Line 376
    ('className={`mt-1 text-sm text-danger` + \'/\' + `80`}', 'className={cls(\'mt-1 text-sm text-danger\', frac(\'80\'))}'),
    # Line 388
    ('className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary` + \'/\' + `12 text-primary`}', 'className={cls(\'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary\', frac(\'12\'), \'text-primary\')}'),
    # Line 405
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-destructive` + \'/\' + `25 bg-destructive`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full border border-destructive\', frac(\'25\'), \'bg-destructive\')}'),
    # Line 415
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-warning` + \'/\' + `25 bg-warning`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full border border-warning\', frac(\'25\'), \'bg-warning\')}'),
    # Line 425
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold\')}'),
    # Line 434
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2\')}'),
    # Line 270 (duplicate)
    ('className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-verified` + \'/\' + `12 text-verified`}', 'className={cls(\'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-verified\', frac(\'12\'), \'text-verified\')}'),
    # Line 583
    ('className={`wl-card p-5 border-danger` + \'/\' + `25 bg-danger${' + '/'} + `5`}', 'className={cls(\'wl-card p-5 border-danger\', frac(\'25\'), \'bg-danger\', frac(\'5\'))}'),
    # Line 376
    ('className={`mt-1 text-sm text-danger` + \'/\' + `80`}', 'className={cls(\'mt-1 text-sm text-danger\', frac(\'80\'))}'),
    # Line 388
    ('className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary` + \'/\' + `12 text-primary`}', 'className={cls(\'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary\', frac(\'12\'), \'text-primary\')}'),
    # Line 405
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-destructive` + \'/\' + `25 bg-destructive`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full border border-destructive\', frac(\'25\'), \'bg-destructive\')}'),
    # Line 415
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-warning` + \'/\' + `25 bg-warning`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full border border-warning\', frac(\'25\'), \'bg-warning\')}'),
    # Line 425
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold\')}'),
    # Line 434
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2\')}'),
    # Line 270 (duplicate)
    ('className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-verified` + \'/\' + `12 text-verified`}', 'className={cls(\'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-verified\', frac(\'12\'), \'text-verified\')}'),
    # Line 583
    ('className={`wl-card p-5 border-danger` + \'/\' + `25 bg-danger${' + \'/\'} + `5`}', 'className={cls(\'wl-card p-5 border-danger\', frac(\'25\'), \'bg-danger\', frac(\'5\'))}'),
    # Line 376
    ('className={`mt-1 text-sm text-danger` + \'/\' + `80`}', 'className={cls(\'mt-1 text-sm text-danger\', frac(\'80\'))}'),
    # Line 388
    ('className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary` + \'/\' + `12 text-primary`}', 'className={cls(\'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary\', frac(\'12\'), \'text-primary\')}'),
    # Line 405
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-destructive` + \'/\' + `25 bg-destructive`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full border border-destructive\', frac(\'25\'), \'bg-destructive\')}'),
    # Line 415
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-warning` + \'/\' + `25 bg-warning`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full border border-warning\', frac(\'25\'), \'bg-warning\')}'),
    # Line 425
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold\')}'),
    # Line 434
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2\')}'),
    # Line 270 (duplicate)
    ('className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-verified` + \'/\' + `12 text-verified`}', 'className={cls(\'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-verified\', frac(\'12\'), \'text-verified\')}'),
    # Line 583
    ('className={`wl-card p-5 border-danger` + \'/\' + `25 bg-danger${' + '/'} + `5`}', 'className={cls(\'wl-card p-5 border-danger\', frac(\'25\'), \'bg-danger\', frac(\'5\'))}'),
    # Line 376
    ('className={`mt-1 text-sm text-danger` + \'/\' + `80`}', 'className={cls(\'mt-1 text-sm text-danger\', frac(\'80\'))}'),
    # Line 388
    ('className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary` + \'/\' + `12 text-primary`}', 'className={cls(\'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary\', frac(\'12\'), \'text-primary\')}'),
    # Line 405
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-destructive` + \'/\' + `25 bg-destructive`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full border border-destructive\', frac(\'25\'), \'bg-destructive\')}'),
    # Line 415
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-warning` + \'/\' + `25 bg-warning`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full border border-warning\', frac(\'25\'), \'bg-warning\')}'),
    # Line 425
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold\')}'),
    # Line 434
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2`}', 'className={cls(\'w-full justify-start inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2\')}'),
]

with open('src/pages/BusinessIntelligenceResults.tsx', 'r') as f:
    content = f.read()

for old, new in replacements:
    content = content.replace(old, new)

with open('src/pages/BusinessIntelligenceResults.tsx', 'w') as f:
    f.write(content)

print('Fixed string concatenations in BusinessIntelligenceResults.tsx')