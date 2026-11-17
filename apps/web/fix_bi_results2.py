import re

with open('src/pages/BusinessIntelligenceResults.tsx', 'r') as f:
    content = f.read()

replacements = [
    # Line 238
    ('className={`flex flex-wrap items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-card via-secondary` + "/" + `60 to-ai`}', 'className={cls("flex flex-wrap items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-card via-secondary", frac("60"), "to-ai")}'),
    # Line 19437
    ('className={`wl-card p-5 border-danger` + "/" + `25 bg-danger${` + "/" + `}5`}', 'className={cls("wl-card p-5 border-danger", frac("25"), "bg-danger", frac("5"))}'),
    # Line 21052
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-destructive` + "/" + `25 bg-destructive${` + "/" + `}10 px-4 py-2 text-sm font-medium text-destructive transition hover:bg-destructive${' + '/' + `}20`}', 'className={cls("w-full justify-start inline-flex items-center gap-2 rounded-full border border-destructive", frac("25"), "bg-destructive", frac("10"), "px-4 py-2 text-sm font-medium text-destructive transition hover:bg-destructive", frac("20"))}'),
    # Line 21139
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-destructive` + "/" + `25 bg-destructive${' + "/" + `}10 px-4 py-2 text-sm font-medium text-destructive transition hover:bg-destructive` + "/" + `20`}', 'className={cls("w-full justify-start inline-flex items-center gap-2 rounded-full border border-destructive", frac("25"), "bg-destructive", frac("10"), "px-4 py-2 text-sm font-medium text-destructive transition hover:bg-destructive", frac("20"))}'),
    # Line 21578
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-warning` + "/" + `25 bg-warning>>${' + "/" + `}10 px-4 py-2 text-sm font-medium text-warning-foreground transition hover:bg-warning${' + '/' + `}20`}', 'className={cls("w-full justify-start inline-flex items-center gap-2 rounded-full border border-warning", frac("25"), "bg-warning", frac("10"), "px-4 py-2 text-sm font-medium text-warning-foreground transition hover:bg-warning", frac("20"))}'),
    # Line 21668
    ('className={`w-full justify-start inline-flex items-center gap-2 rounded-full border border-warning` + "/" + `25 bg-warning` + "/" + `10 px-4 py-2 text-sm font-medium text-warning-foreground transition hover:bg-warning` + "/" + `20`}', 'className={cls("w-full justify-start inline-flex items-center gap-2 rounded-full border border-warning", frac("25"), "bg-warning", frac("10"), "px-4 py-2 text-sm font-medium text-warning-foreground transition hover:bg-warning", frac("20"))}'),
]

with open('src/pages/BusinessIntelligenceResults.tsx', 'r') as f:
    content = f.read()

for old, new in replacements:
    content = content.replace(old, new)

with open('src/pages/BusinessIntelligenceResults.tsx', 'w') as f:
    f.write(content)

print('Fixed string concatenations')
EOF