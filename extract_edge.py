with open('kakushie_bundle_0.js', 'r', encoding='utf-8') as f:
    js = f.read()

idx = js.find('edgeThreshold')
if idx != -1:
    print("Found edgeThreshold at index:", idx)
    with open('edge_code.txt', 'w', encoding='utf-8') as out:
        out.write(js[idx-500:idx+1500])
    print("Saved edge_code.txt!")
