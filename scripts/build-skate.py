"""Build a foot-local hockey skate in the active Blender scene.
Run from the repository root or set project_root before executing via Blender MCP.
"""
import bpy, math
from mathutils import Vector
from pathlib import Path
project_root=Path(globals().get('project_root',Path.cwd()))
library=bpy.data.collections.new('Performance skate')
bpy.context.scene.collection.children.link(library)
palette={}
for label,rgb,rough,metal in [('boot',(.021,.028,.034),.49,.14),('shoe',(.085,.095,.10),.80,0),('pad',(.76,.78,.78),.48,0),('steel',(.46,.52,.57),.24,.92)]:
    m=bpy.data.materials.new(label)
    m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Roughness'].default_value=rough
    p.inputs['Metallic'].default_value=metal
    m.diffuse_color=(*rgb,1)
    palette[label]=m
def xyz(x,y,z):return (x,-z,y)
def mesh(name,verts,faces,material):
    m=bpy.data.meshes.new(name)
    m.from_pydata([xyz(*v) for v in verts],[],faces)
    m.update()
    o=bpy.data.objects.new(name,m)
    library.objects.link(o)
    m.materials.append(palette[material])
    for p in m.polygons:p.use_smooth=True
    return o
def shell(name,sections,mat):
    verts=[];faces=[];n=20
    for z,rx,base,top in sections:
        for i in range(n):
            a=i*math.tau/n
            c,s=math.cos(a),math.sin(a)
            verts.append((rx*math.copysign(abs(c)**.80,c),base+(top-base)*(.5+.5*math.copysign(abs(s)**.85,s)),z))
    for j in range(len(sections)-1):
        for i in range(n):
            k=j*n+i;h=j*n+(i+1)%n
            faces.append((k,h,h+n,k+n))
    faces += [tuple(reversed(range(n))),tuple(range(len(verts)-n,len(verts)))]
    return mesh(name,verts,faces,mat)
def rail(name,path,radius,mat):
    # Circular section along a 3D polyline.
    vs=[];fs=[];n=6
    for j,p in enumerate(path):
        v=Vector(p); tangent=(Vector(path[min(len(path)-1,j+1)])-Vector(path[max(0,j-1)])).normalized()
        normal=tangent.cross(Vector((0,1,0))).normalized()
        if normal.length<.1:normal=Vector((1,0,0))
        side=tangent.cross(normal)
        for i in range(n):
            a=i*math.tau/n
            vs.append(v+radius*(math.cos(a)*normal+math.sin(a)*side))
    for j in range(len(path)-1):
        for i in range(n):
            k=j*n+i;h=j*n+(i+1)%n
            fs.append((k,h,h+n,k+n))
    return mesh(name,vs,fs,mat)
def plate(name,outline,width,mat):
    n=len(outline)
    vs=[(x,y,z) for x in (-width/2,width/2) for z,y in outline]
    fs=[tuple(range(n)),tuple(reversed(range(n,2*n)))]
    fs.extend((i,i+n,(i+1)%n+n,(i+1)%n) for i in range(n))
    return mesh(name,vs,fs,mat)
last=[(-.095,.029,-.062,.070),(-.081,.049,-.068,.109),(-.055,.056,-.069,.125),
      (-.018,.059,-.069,.113),(.008,.061,-.069,.096),(.04,.059,-.069,.064),
      (.075,.055,-.069,.036),(.108,.052,-.068,.012),(.140,.048,-.067,-.008),
      (.165,.041,-.065,-.016),(.177,.024,-.060,-.029)]
shell('Quarter shell',last,'boot')
shell('Ankle tongue',[(-.006,.031,.093,.126),(.008,.036,.086,.121),(.032,.038,.062,.090),(.065,.037,.035,.059),(.095,.032,.014,.034),(.118,.031,.001,.018)],'shoe')
shell('Rubber toe bumper',[(z,rx+.0014,base-.001,top+.002) for z,rx,base,top in last[-4:]],'boot')
plate('Steel runner',[(-.107,-.097),(.181,-.095),(.174,-.103),(.153,-.110),(.115,-.114),(.015,-.115),(-.062,-.113),(-.089,-.108)],.0038,'steel')
plate('Blade carrier',[(-.101,-.092),(-.083,-.086),(.159,-.085),(.178,-.092),(.175,-.100),(-.098,-.101)],.016,'pad')
for z in (-.058,.113):
    shell('Holder tower',[(z-.028,.008,-.094,-.064),(z-.015,.014,-.094,-.063),(z+.013,.016,-.094,-.063),(z+.025,.007,-.09,-.063)],'pad')
for side in (-1,1):
    rail('Quarter piping',[(side*.048,.095,-.068),(side*.055,.068,-.038),(side*.058,.016,.002),(side*.052,-.027,.068),(side*.045,-.042,.13)],.0024,'shoe')
for j in range(6):
    z=.004+j*.017
    top=.124-j*.0185
    for side in (-1,1):
        rail('Cross lace',[(side*.036,top-.014,z-.005),(side*.015,top+.001,z+.002),(-side*.012,top-.002,z+.008),(-side*.035,top-.019,z+.014)],.0028,'pad')
for o in list(library.objects):
    o.name='near_'+o.name
    if 'lace' not in o.name and 'piping' not in o.name:
        m=o.copy();m.name=o.name.replace('near_','broadcast_');library.objects.link(m)
bpy.ops.object.select_all(action='DESELECT')
for o in library.objects:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(project_root/'src/assets/skate.glb'),use_selection=True,export_format='GLB',export_animations=False)
