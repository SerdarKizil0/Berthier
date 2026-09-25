"""Export only versionable source plus planning docs; never copy Git history or local data."""
from pathlib import Path
import subprocess, re, shutil, json

root = Path(__file__).resolve().parents[1]
target = root / '.sites-runtime' / 'github-export'
names = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=root).decode().split('\0')
blocked = {'.git', 'node_modules', '.sites-runtime', '.wrangler', '.next', '.vinext', 'dist', 'build', '.agents', '.codex'}
def permitted(name):
    p = Path(name)
    return not any(part in blocked or part.startswith(('.env', '.dev.vars')) for part in p.parts) and p.suffix not in {'.pem', '.key', '.sqlite', '.sqlite3', '.db', '.tar', '.gz'}

sources = {name: root / name for name in set(names) if name and permitted(name) and (root / name).is_file()}
sources.update({'docs/' + p.name:p for p in root.parent.glob('*.md')})
secrets=[]
for filename in ['.env.local','.dev.vars']:
    p=root/filename
    if p.exists():
        for line in p.read_text(encoding='utf-8-sig').splitlines():
            if '=' in line:
                name,value=line.split('=',1)
                if any(word in name.upper() for word in ['KEY','TOKEN','SECRET','PASSWORD']):
                    value=value.strip().strip('\"\'')
                    if len(value)>=12:secrets.append(value.encode())
patterns=[rb'sk-ant-[A-Za-z0-9_-]{15,}',rb'AIza[A-Za-z0-9_-]{25,}',rb'gh[pousr]_[A-Za-z0-9]{20,}',rb'github_pat_[A-Za-z0-9_]{20,}',rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----']
problems=[]
for name,p in sources.items():
    data=p.read_bytes()
    if any(secret in data for secret in secrets) or any(re.search(pattern,data) for pattern in patterns):problems.append(name)
if problems:
    raise SystemExit('Secret scan failed in files (values suppressed): '+', '.join(problems))
target.mkdir(parents=True,exist_ok=True)
# Refuse unexpected old files instead of deleting them implicitly.
extras=[str(p.relative_to(target)) for p in target.rglob('*') if p.is_file() and '.git' not in p.relative_to(target).parts and str(p.relative_to(target)).replace('\\','/') not in sources]
if extras:raise SystemExit('Review unexpected export files: '+', '.join(extras))
for name,p in sources.items():
    destination=target/name;destination.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,destination)
# No .env file, including the blank example, belongs in this separate snapshot.
with (target/'.gitignore').open('a',encoding='utf-8') as f:f.write('\n# GitHub snapshot: exclude every environment file, including examples.\n.env*\n.dev.vars*\n')
print(json.dumps({'source_files':len(sources),'known_secrets_checked':len(secrets),'secret_matches':0,'env_files':0,'export':str(target)},ensure_ascii=False))
