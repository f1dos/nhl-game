"""Blender head-local equipment library. Centimetre measurements converted to metres."""
import bpy
import math
from pathlib import Path
from mathutils import Vector

out = Path(__file__).resolve().parents[1] / "src/assets"
out.mkdir(exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
materials = {}
for name, color, rough in [
    ("helmet", (.05,.12,.35), .27), ("mask", (.85,.88,.9), .32),
    ("cage", (.57,.64,.68), .24), ("boot", (.027,.03,.035), .56),
    ("steel", (.7,.72,.75), .23)]:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color,1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color,1)
    shader.inputs["Roughness"].default_value = rough
    shader.inputs["Metallic"].default_value = float(name in ("steel","cage"))
    materials[name] = mat

def point(x,y,z):
    return (x/100,-z/100,y/100)

def shell(role):
    goalie = role == "goalie"
    verts, faces = [], []
    n, rows = 48, 20
    for j in range(rows+1):
        phi = .015 + j/rows * (2.69 if goalie else 2.13)
        for i in range(n):
            a = i*math.tau/n
            front = max(0,math.cos(a))
            # Long chin and occipital protection, raised brow above the visor.
            lift = 0 if goalie else front**1.2 * (j/rows)**3 * 8
            ridge = 1 + .035*math.cos(6*a)*math.sin(phi)**2
            verts.append(point(12.2*math.sin(phi)*math.sin(a)*ridge,
                2.1 + 13.5*math.cos(phi) + lift,
                -1 + (14.4 + (2.8 if goalie else 0)*(j/rows)**2)*math.sin(phi)*math.cos(a)))
    for j in range(rows):
        for i in range(n):
            col = min(i,n-1-i)
            if goalie and 6 <= j <= 14 and col < (8 if j<13 else 6): continue
            if j in (3,4,5,6) and col in (5,6,14,15): continue
            a=j*n+i; b=j*n+(i+1)%n
            faces.append((a,a+n,b+n,b))
    mesh=bpy.data.meshes.new(role); mesh.from_pydata(verts,[],faces); mesh.update()
    uv = mesh.uv_layers.new(name="Shell wrap")
    for polygon in mesh.polygons:
        indices = [mesh.loops[k].vertex_index for k in polygon.loop_indices]
        seam = max(i%n for i in indices)-min(i%n for i in indices)>1
        for k,i in zip(polygon.loop_indices,indices):
            uv.data[k].uv = (1 if seam and i%n==0 else (i%n)/n, 1-(i//n)/rows)
    obj=bpy.data.objects.new(role,mesh); bpy.context.collection.objects.link(obj)
    obj.data.materials.append(materials["mask" if goalie else "helmet"])
    for f in mesh.polygons: f.use_smooth=True
    solid=obj.modifiers.new("Moulded rim","SOLIDIFY"); solid.thickness=.003
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.modifier_apply(modifier=solid.name)

def wire(role, name, pts, radius):
    curve=bpy.data.curves.new(name,"CURVE"); curve.dimensions="3D"; curve.bevel_depth=radius/100
    curve.bevel_resolution=1
    spline=curve.splines.new("POLY"); spline.points.add(len(pts)-1)
    for p,coords in zip(spline.points,pts): p.co=(*point(*coords),1)
    obj=bpy.data.objects.new(role+"_"+name,curve); bpy.context.collection.objects.link(obj)
    obj.data.materials.append(materials[name])
    bpy.context.view_layer.objects.active=obj; obj.select_set(True)
    bpy.ops.object.convert(target="MESH"); obj.select_set(False)

for role in ("skater","goalie"):
    shell(role)
    if role=="goalie":
        for y in (-6,-1,6.3):
            wire(role,"cage",[(12.4*math.sin(a/12),y+.9*(a/12)**2,15.1*math.cos(a/12)) for a in range(-14,15)],.34)
        for x in (-8,-3,3,8):
            wire(role,"cage",[(x*.72,-8,11.8-abs(x)*.16),(x,-2,15.1-abs(x)*.28),(x*1.12,6.5,15-abs(x)*.32)],.32)
    else:
        for side in (-1,1):
            wire(role,"boot",[(side*11.8,.5,2),(side*9,-5,3),(side*4,-11,4),(0,-11.7,4)],.45)
# A separate broadcast shell keeps the aperture and cage silhouette at distance.
for original in list(bpy.context.scene.objects):
    part=original.copy()
    part.data=original.data.copy()
    part.name="broadcast_"+original.name
    bpy.context.collection.objects.link(part)
    reduce=part.modifiers.new("Broadcast topology","DECIMATE")
    reduce.ratio=.32
    bpy.context.view_layer.objects.active=part
    bpy.ops.object.modifier_apply(modifier=reduce.name)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/"headgear.blend"))
bpy.ops.export_scene.gltf(filepath=str(out/"headgear.glb"), export_format="GLB", export_yup=True)
