"""blender -b -P scripts/build-face.py -- /path/to/MakeHuman/hm08/base.obj

Source and CC0 dedication: https://github.com/makehumancommunity/makehuman/blob/master/makehuman/data/3dobjs/base.obj
"""
import bpy
import json
import sys
from pathlib import Path

points, faces = [], []
group = None
for line in Path(sys.argv[-1]).read_text().splitlines():
    fields = line.split()
    if fields[:1] == ["v"]:
        points.append(tuple(map(float, fields[1:4])))
    elif fields[:1] == ["g"]:
        group = fields[1]
    elif fields[:1] == ["f"] and group == "body":
        face = [int(item.split("/")[0]) - 1 for item in fields[1:]]
        if all(points[i][1] >= 6.04 for i in face):
            faces.append(face)

used = sorted(set(i for face in faces for i in face))
remap = {old: new for new, old in enumerate(used)}
result = {}
for name, budget in [("near", 3300), ("middle", 1100), ("far", 260)]:
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([points[i] for i in used], [], [[remap[i] for i in f] for f in faces])
    model = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(model)
    bpy.context.view_layer.objects.active = model
    mesh.calc_loop_triangles()
    reduce = model.modifiers.new("Retain facial landmarks", "DECIMATE")
    reduce.ratio = min(1, budget / len(mesh.loop_triangles))
    bpy.ops.object.modifier_apply(modifier=reduce.name)
    mesh = model.data
    mesh.calc_loop_triangles()
    result[name] = dict(points=[round(axis * 1000) for v in mesh.vertices for axis in v.co],
                        indices=[i for tri in mesh.loop_triangles for i in tri.vertices])
path = Path(__file__).resolve().parents[1] / "src/assets/hm08-head.json"
path.write_text(json.dumps(result, separators=(",", ":")))
