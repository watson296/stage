import base64

with open(r'C:\Users\황지후\Desktop\WorkSpace\Saegyeol\사진압축해제\새결로고(화질상승).png', 'rb') as f:
    logo_b64 = base64.b64encode(f.read()).decode()

html = open(r'C:\Users\황지후\Desktop\Python Works\Stage\template.html', 'r', encoding='utf-8').read()
html = html.replace('__LOGO_B64__', logo_b64)

with open(r'C:\Users\황지후\Desktop\Python Works\Stage\stage-planner.html', 'w', encoding='utf-8') as f:
    f.write(html)

print('Done! Size:', len(html) // 1024, 'KB')
