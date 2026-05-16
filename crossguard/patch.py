import sys

def get_func(filename, func_name):
    with open(filename, 'r') as f:
        lines = f.readlines()
    
    start = -1
    end = -1
    for i, line in enumerate(lines):
        if line.startswith(f"  {func_name}("):
            start = i
        if start != -1 and line.rstrip() == "  }":
            end = i
            break
            
    return "".join(lines[start:end+1])

m1 = get_func('src/city.orig.js', '_buildBuildingsFromModels')
m2 = get_func('src/city.orig.js', '_buildBuildingsSimple')
m3 = get_func('src/city.orig.js', '_addWindows')

with open('src/city.js', 'r') as f:
    target = f.read()

def replace_func(target, func_name, replacement):
    lines = target.split('\n')
    start = -1
    end = -1
    for i, line in enumerate(lines):
        if line.startswith(f"  {func_name}("):
            start = i
        if start != -1 and line == "  }":
            end = i
            break
    
    old_text = "\n".join(lines[start:end+1])
    return target.replace(old_text, replacement)

target = replace_func(target, '_buildBuildingsFromModels', m1.strip('\n'))
target = replace_func(target, '_buildBuildingsSimple', m2.strip('\n'))
target = replace_func(target, '_addWindows', m3.strip('\n'))

with open('src/city.js', 'w') as f:
    f.write(target)
