import re,sys,os,json
# Heuristic audit: find `${expr}` inside template literals that are assigned to innerHTML / insertAdjacentHTML / outerHTML
# and where expr is not obviously safe (escapeHTML(...), numbers, ids, known-safe helpers, ternaries of literals).
SAFE_CALLS = re.compile(r'^(esc\w*|escape\w*|safe\w*|sanitize\w*|encodeURIComponent|Number|Math\.\w+|parseInt|parseFloat|formatMoney|formatNaira|fmtMoney|fmtNaira|money|naira|formatDate|fmtDate|pluralize|plural)\s*\(')
def find_templates(src):
    # yield (start_index, template_string) for backtick strings following innerHTML / insertAdjacentHTML
    for m in re.finditer(r'(innerHTML\s*[+]?=|insertAdjacentHTML\s*\([^,]+,|outerHTML\s*=)\s*', src):
        i=m.end()
        # statement may begin with a function call or a template; scan until first backtick within 200 chars or until ';'
        j=src.find('`',i)
        k=src.find(';',i)
        if j==-1 or (k!=-1 and k<j): 
            yield (m.start(), None, src[i:k if k!=-1 else i+120])
            continue
        # parse template literal honoring nested ${ ... } with backticks inside
        p=j+1; depth=0; out=[]
        while p<len(src):
            c=src[p]
            if c=='\\': p+=2; continue
            if depth==0 and c=='`': break
            if c=='$' and src[p+1:p+2]=='{':
                depth+=1; p+=2; expr_start=p
                # find matching }
                d=1
                while p<len(src) and d>0:
                    if src[p]=='`':
                        # skip nested template
                        p+=1
                        nd=0
                        while p<len(src):
                            if src[p]=='\\': p+=2; continue
                            if src[p]=='$' and src[p+1:p+2]=='{': nd+=1; p+=2; continue
                            if src[p]=='}' and nd>0: nd-=1; p+=1; continue
                            if src[p]=='`' and nd==0: break
                            p+=1
                    elif src[p]=='{': d+=1
                    elif src[p]=='}': d-=1
                    p+=1
                out.append(src[expr_start:p-1]); depth-=1
                continue
            p+=1
        yield (m.start(), out, None)
def risky(expr):
    e=expr.strip()
    if not e: return False
    if SAFE_CALLS.match(e): return False
    # literal / numeric-ish
    if re.fullmatch(r'["\'][^"\'`$]*["\']',e): return False
    if re.fullmatch(r'[\d.\s+\-*/()%]+',e): return False
    # ternary whose branches are all string literals or empty
    if '?' in e and ':' in e:
        parts=re.findall(r'"[^"]*"|\'[^\']*\'|`[^`$]*`',e)
        rest=re.sub(r'"[^"]*"|\'[^\']*\'|`[^`$]*`','',e)
        # if after removing literals there is nothing but the condition, still may hold vars in condition only
        cond=e.split('?')[0]
        branches=e[len(cond)+1:]
        bl=re.sub(r'"[^"]*"|\'[^\']*\'|`[^`$]*`','',branches)
        if re.fullmatch(r'[\s:?]*',bl): return False
    # nested templates containing only escaped values: check inner ${}
    if e.startswith('`') or '`' in e:
        inner=re.findall(r'\$\{([^{}]*)\}',e)
        if all(not risky(x) for x in inner) : 
            # and no other bare identifiers outside ${}: accept
            return False
    # .map(...).join("") of templates: audit the inner separately (they are audited as nested), treat as safe here
    if re.search(r'\.join\(\s*["\']["\']?\s*\)\s*$',e): return False
    # id-like values: something.id, .count, .length, index vars
    if re.fullmatch(r'[\w.\[\]]*(\.id|Id|_id|\.length|\.count|\.size|\.index|idx|i)\b',e): return False
    return True
report={}
for root,_,files in os.walk('js'):
    for f in files:
        if not f.endswith('.js'): continue
        path=os.path.join(root,f); src=open(path,encoding='utf-8').read()
        for start,exprs,raw in find_templates(src):
            line=src.count('\n',0,start)+1
            if exprs is None:
                continue
            for e in exprs:
                if risky(e):
                    report.setdefault(path,[]).append((line,e.strip()[:110]))
USER=re.compile(r'(title|name|desc|body|note|email|message|msg|comment|reason|address|company|subject|text|content|summary|question|answer|bio|headline|tagline|location|phone|url|href|link|src|label|author|client|student|customer|recipient|payer|who|to_whom|category|tag|value|input|query|term|filename|file_name|display)',re.I)
CONFIG=re.compile(r'(color|icon|Color|Icon|STATUS|SEVERITY|APPROVAL_|TERMINOLOGY|SENTINEL_|toFixed|toLocale|new Date|\.length|percent|width|height|count)')
report={p:[(l,e) for l,e in v if USER.search(e) and not CONFIG.search(e)] for p,v in report.items()}
report={p:v for p,v in report.items() if v}
tot=sum(len(v) for v in report.values())
print("files with flagged interpolations:",len(report),"total flagged:",tot)
for p,v in sorted(report.items(), key=lambda kv:-len(kv[1])):
    print(f"\n{p}  ({len(v)})")
    for line,e in v[:60]: print(f"  L{line}: {e}")
