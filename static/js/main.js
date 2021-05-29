import { parse } from "./pcd-format/pcd-format.js"

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 200000);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const pointSize = 0.01;

const typeTrans = { 'F': Float32Array, 'U': Uint32Array, 'I': Int32Array };

let geometry = new THREE.BufferGeometry();
let material = new THREE.PointsMaterial({ size: pointSize, vertexColors: true });
let pointcloud = new THREE.Points(geometry, material);
pointcloud.frustumCulled = false;
pointcloud.quaternion.copy(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI)));
scene.add(pointcloud);

camera.position.y = 5;

let controls = new THREE.OrbitControls(camera);
controls.rotateSpeed = 0.5;
controls.zoomSpeed = 2.0;
controls.panSpeed = 0.5;
controls.enableDamping = true;
controls.dampingFactor = 0.3;
controls.addEventListener('change', render);

function render() {
    renderer.render(scene, camera);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
}

window.addEventListener('resize', () => {
    console.log('resize');
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    render();
});

let cloud = null;
let colorField = -1;

function generateCloudPosition(cloud) {
    if (cloud == null) return null;
    let size = cloud.header.width * cloud.header.height;
    let offset_x = -1;
    let offset_y = -1;
    let offset_z = -1;
    for (let i = 0; i < cloud.header.fields.length; i++) {
        if (cloud.header.fields[i] == 'x') offset_x = i;
        if (cloud.header.fields[i] == 'y') offset_y = i;
        if (cloud.header.fields[i] == 'z') offset_z = i;
    }
    let vertices = new Float32Array(size * 3);
    for (let i = 0; i < size; i++) {
        let point = cloud.points[i];
        if (offset_x >= 0) vertices[i * 3 + 0] = point[offset_x];
        if (offset_y >= 0) vertices[i * 3 + 1] = point[offset_y];
        if (offset_z >= 0) vertices[i * 3 + 2] = point[offset_z];
    }
    return new THREE.BufferAttribute(vertices, 3);
}

function generateCloudColorByConstant(cloud, constant) {
    if (cloud == null) return null;
    let size = cloud.header.width * cloud.header.height;
    let colors = new Float32Array(size * 3);
    for (let i = 0; i < size; i++) {
        colors[i * 3 + 0] = constant[0] / 255.0;
        colors[i * 3 + 1] = constant[1] / 255.0;
        colors[i * 3 + 2] = constant[2] / 255.0;
    }
    return new THREE.BufferAttribute(colors, 3);
}

function generateCloudColorByField(cloud, colorField) {
    if (cloud == null) return null;
    if (cloud.header.fields[colorField] === 'rgb') {
        return generateCloudColorByRGB(cloud, colorField);
    }
    if (cloud.header.fields[colorField] === 'rgba') {
        return generateCloudColorByRGBA(cloud, colorField);
    }
    let size = cloud.header.width * cloud.header.height;
    let values = [];
    if (colorField < 0) colorField = 0;
    if (colorField >= cloud.header.fields.length) colorField = cloud.header.fields.length - 1;
    for (let i = 0; i < size; i++) {
        values.push(cloud.points[i][colorField]);
    }
    let max = -Infinity;
    let min = Infinity;
    for (let i of values) {
        if (max < i) max = i;
        if (min > i) min = i;
    }
    let colors = new Float32Array(size * 3);
    for (let i = 0; i < size; i++) {
        let index = Math.floor((values[i] - min) / (max - min) * 255);
        if (!isFinite(index)) index = 0;
        let data = colormapCtx.getImageData(index, 5, 1, 1).data;
        colors[i * 3 + 0] = data[0] / 255.0;
        colors[i * 3 + 1] = data[1] / 255.0;
        colors[i * 3 + 2] = data[2] / 255.0;
    }
    return new THREE.BufferAttribute(colors, 3);
}

function generateCloudColorByRGB(cloud, colorField) {
    let size = cloud.header.width * cloud.header.height;
    let colors = new Float32Array(size * 3);
    let cache = new typeTrans[cloud.header.type[colorField]](1);
    let view = new Uint8Array(cache.buffer);
    for (let i = 0; i < size; i++) {
        cache[0] = cloud.points[i][colorField];
        colors[i * 3 + 0] = view[2] / 255.0;
        colors[i * 3 + 1] = view[1] / 255.0;
        colors[i * 3 + 2] = view[0] / 255.0;
    }
    return new THREE.BufferAttribute(colors, 3);
}

function generateCloudColorByRGBA(cloud, colorField) {
    let size = cloud.header.width * cloud.header.height;
    let colors = new Float32Array(size * 4);
    let cache = new typeTrans[cloud.header.type[colorField]](1);
    let view = new Uint8Array(cache.buffer);
    for (let i = 0; i < size; i++) {
        cache[0] = cloud.points[i][colorField];
        colors[i * 4 + 0] = view[2] / 255.0;
        colors[i * 4 + 1] = view[1] / 255.0;
        colors[i * 4 + 2] = view[0] / 255.0;
        colors[i * 4 + 3] = view[3] / 255.0;
    }
    return new THREE.BufferAttribute(colors, 4);
}

function selectFieldColor(event) {
    colorField = parseInt(event.currentTarget.dataset.index);
    geometry.setAttribute('color', generateCloudColorByField(cloud, colorField));
    render();
    document.querySelectorAll('#color-fields>div').forEach((node) => { node.className = ''; });
    document.getElementById('field-' + colorField).className = 'current';
    return true;
}

let colormapCtx = document.getElementById('colormap').getContext('2d');

document.getElementById('colormap-current').addEventListener('click', () => {
    if (document.getElementById('colormap-list').style.display != 'none') {
        document.getElementById('colormap-list').style.display = 'none';
    } else {
        document.getElementById('colormap-list').style.display = 'block';
    }
});

for (let node of document.getElementById('colormap-list').children) {
    node.addEventListener('click', () => {
        colormapCtx.drawImage(node.children[0], 0, 0);
        document.getElementById('colormap-list').style.display = 'none';
        if (colorField >= 0) {
            geometry.setAttribute('color', generateCloudColorByField(cloud, colorField));
            render();
        }
    });
}

window.addEventListener('keypress', (event) => {
    if (event.key.charCodeAt(0) >= '0'.charCodeAt(0) && event.key.charCodeAt(0) <= '9'.charCodeAt(0)) {
        let key = (parseInt(event.key) + 9) % 10
        if (key < cloud.header.fields.length) {
            colorField = key;
            geometry.setAttribute('color', generateCloudColorByField(cloud, colorField));
            render();
            document.querySelectorAll('#color-fields>div').forEach((node) => { node.className = ''; });
            document.getElementById('color-fields').children[key].className = 'current';
        }
    }
    if (event.key == '`') {
        geometry.setAttribute('color', generateCloudColorByConstant(cloud, [255, 255, 255]));
        render();
        document.querySelectorAll('#color-fields>div').forEach((node) => { node.className = ''; });
    }
});

colormapCtx.drawImage(document.getElementById('colormap-list').children[0].children[0], 0, 0);
document.getElementById('colormap-list').children[0].children[0].addEventListener('load', () => {
    colormapCtx.drawImage(document.getElementById('colormap-list').children[0].children[0], 0, 0);
});

const orbitList = {
    'X+': {
        quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2),
        position: new THREE.Vector3(0, 0, 5)
    },
    'X-': {
        quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
            .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)),
        position: new THREE.Vector3(0, 0, 5)
    },
    'Y+': {
        quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI),
        position: new THREE.Vector3(0, 0, -5)
    },
    'Y-': {
        quaternion: new THREE.Quaternion(),
        position: new THREE.Vector3(0, 0, -5)
    },
    'Z+': {
        quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
            .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI)),
        position: new THREE.Vector3(0, 5, 0)
    },
    'Z-': {
        quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
        position: new THREE.Vector3(0, 5, 0)
    }
}

let orbitContent = document.getElementById('orbit-list');
for (let i in orbitList) {
    let item = document.createElement('div');
    item.innerText = i;
    item.addEventListener('click', (event) => {
        pointcloud.quaternion.copy(orbitList[event.currentTarget.innerText].quaternion);
        camera.position.copy(orbitList[event.currentTarget.innerText].position);
        document.querySelectorAll('#orbit-list>div').forEach((node) => { node.className = ''; });
        item.className = 'current';
    });
    orbitContent.appendChild(item);
}
orbitContent.children[4].className = 'current';

render();
animate();

window.addEventListener('message', async e => {
    const { type, body } = e.data;
    if (body.value == null) return;
    cloud = parse(new Uint8Array(body.value.data).buffer);
    geometry.setAttribute('position', generateCloudPosition(cloud));
    geometry.setAttribute('color', generateCloudColorByConstant(cloud, [255, 255, 255]));
    let content = document.getElementById('color-fields');
    content.innerHTML = '';
    for (let i = 0; i < cloud.header.fields.length; i++) {
        let item = document.createElement('div');
        item.dataset.index = i;
        item.id = 'field-' + i;
        item.addEventListener('click', selectFieldColor);
        let key = document.createElement('div');
        key.className = 'key';
        key.innerText = (i + 1).toString();
        let name = document.createElement('div');
        let nameArr = cloud.header.fields[i].split('_').map((v) => v[0].toLowerCase());
        nameArr[0] = nameArr[0].toUpperCase();
        name.innerText = nameArr.join('');
        if (cloud.header.fields[i] === 'rgb' || cloud.header.fields[i] === 'rgba') {
            name.innerText = cloud.header.fields[i].toUpperCase();
        }
        item.appendChild(key);
        item.appendChild(name);
        content.appendChild(item);
    }
    render();
});

const vscode = acquireVsCodeApi();
vscode.postMessage({ type: 'ready' });
