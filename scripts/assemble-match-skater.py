"""Open the match export as a layered, editable and lit Blender character.
Set project_root before running from the Blender MCP Python console.
"""
import bpy
from pathlib import Path
from mathutils import Vector
project_root=Path(globals().get('project_root',Path.cwd()))
# Use a new scene so the artist's working scene and its objects stay available.
studio=bpy.data.scenes.new('Match skater studio')
bpy.context.window.scene=studio
bpy.ops.import_scene.gltf(filepath=str(project_root/'public/models/hockey/skater-match.glb'))
arm=next(o for o in studio.objects if o.type=='ARMATURE')
body=next(o for o in studio.objects if o.type=='MESH')
arm.name='Match skater'
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
bpy.context.view_layer.objects.active=body
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='MATERIAL')
bpy.ops.object.mode_set(mode='OBJECT')
for o in studio.objects:
    if o.type=='MESH' and o.data.materials:
        mat=o.data.materials[0]
        o.name='Kit '+mat.name.split('.')[0]
        o.data.name=o.name
# Keep imported actions and animation tracks intact; use a skating frame for review.
studio.frame_set(10)
studio.render.engine='CYCLES'
studio.cycles.samples=96
studio.cycles.use_denoising=False
for layer in studio.view_layers: layer.cycles.use_denoising=False
studio.world=bpy.data.worlds.new('Studio fill')
studio.world.color=(.38,.38,.38)
def light(label,p,power,size):
    lamp=bpy.data.lights.new(label,'AREA');lamp.energy=power;lamp.shape='DISK';lamp.size=size
    o=bpy.data.objects.new(label,lamp);studio.collection.objects.link(o);o.location=p
    o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
light('Key',(-2.2,-3.4,3.8),190,3)
light('Fill',(2.2,-2.1,2.1),82,2)
light('Rim',(1.3,1.5,3),200,2)
cam=bpy.data.cameras.new('Review camera');o=bpy.data.objects.new(cam.name,cam)
studio.collection.objects.link(o);studio.camera=o
o.location=(1.6,-3.4,1.45)
o.rotation_euler=(Vector((0,0,.99))-o.location).to_track_quat('-Z','Y').to_euler()
cam.type='ORTHO';cam.ortho_scale=2.55
studio.render.resolution_x=640;studio.render.resolution_y=640
studio.render.resolution_percentage=100
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
        area.spaces.active.overlay.show_overlays=False
arm.show_in_front=False
print([(o.name,len(o.data.vertices)) for o in studio.objects if o.type=='MESH'])
# Store the active studio only, including the armature's NLA actions and packed maps.
bpy.ops.file.pack_all()
out=project_root/'public/models/hockey'
bpy.data.libraries.write(str(out/'match-skater.blend'),{studio},fake_user=True,compress=True)
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
for part in arm.children_recursive:
    if part.type=='MESH' and part.data.materials:part.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=str(out/'match-skater-parts.glb'),export_format='GLB',
                          use_selection=True,use_active_scene=True,export_animation_mode='NLA_TRACKS',export_animations=True,export_cameras=False,export_lights=False)
