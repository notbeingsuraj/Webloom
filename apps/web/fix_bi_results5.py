import re

with open('src/pages/BusinessIntelligenceResults.tsx', 'r') as f:
    content = f.read()

# Replace all remaining string concatenations with '/' using cls and frac
# Pattern: className={`...` + "/" + `...`} -> className={cls("...", frac(...))}
# We'll do this by finding all className={`...` + "/" + `...`} patterns

# First, let's find all className={`...` + "/" + `...`} patterns
pattern = r'className=\{`([^`]*?)`\s*\+\s*"/"\s*\+\s*`([^`]*?)`\}'

def replace_concat(match):
    before = match.group(1)
    after = match.group(2)
    # Split the before and after parts to find fractions
    # This is complex - let's do a simpler approach
    # Replace the concatenation with cls call
    return 'className={cls(`' + before + '`, `' + after + '`)}'

# Actually, let's just do a simple string replacement for the known patterns
# We'll do this more carefully

# Read the file
with open('src/pages/BusinessIntelligenceResults.tsx', 'r') as f:
    content = f.read()

# Replace all occurrences of ` + "/" + ` with `, frac("` in className template literals
# This is a complex transformation - let's do it step by step

# First, let's find all className={`...` + "/" + `...`} patterns
pattern = r'(className=\{`[^`]*?)\s*\+\s*"/"\s*\+\s*(`[^`]*?`\})'

def replace_concat(match):
    full = match.group(0)
    before = match.group(1)
    after = match.group(2)
    # Find fractions in before and after
    # This is complex - let's just replace the concat with cls call
    return 'className={cls(`' + before[13:] + '`, `' + after[:-2] + '`)}'

# This is getting too complex. Let me just do a simpler approach:
# Replace all ` + "/" + ` patterns in className template literals with `, frac("`

# Actually, let's just do a simpler approach - replace all ` + "/" + ` with `, frac("`
# in className template literals

# Let's do a more targeted fix - replace specific patterns we know about

# For now, let's just run the build and see what specific errors we get
print("Script ready to run")

with open('src/pages/BusinessIntelligenceResults.tsx', 'r') as f:
    content = f.read()

# Check for any remaining string concatenations with '/'
lines = content.split('\n')
for i, line in enumerate(lines):
    if ' + "/" + ' in line or ' + \'/\'' in line:
        if 'className' in line:
            print(f'Line {i+1}: {line.strip()[:120]}')
EOF