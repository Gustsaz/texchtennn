const container = document.getElementById('container');

function resolveCtor(name) {
  if (typeof window[name] !== 'undefined') return window[name];
  if (typeof THREE !== 'undefined' && typeof THREE[name] !== 'undefined') return THREE[name];
  return null;
}

function startApp() {
  const cena = new THREE.Scene();
  cena.background = new THREE.Color(0x222222);

  const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  camera.position.set(2.5, 3.5, 5);

  const renderizador = new THREE.WebGLRenderer({ antialias: true });
  renderizador.setPixelRatio(window.devicePixelRatio || 1);
  renderizador.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderizador.domElement);

  try {
    if ('outputColorSpace' in renderizador && 'SRGBColorSpace' in THREE) {
      renderizador.outputColorSpace = THREE.SRGBColorSpace;
    } else if ('outputEncoding' in renderizador && 'sRGBEncoding' in THREE) {
      renderizador.outputEncoding = THREE.sRGBEncoding;
    }
  } catch (e) {}

  const ControlsCtor = resolveCtor('OrbitControls');
  const controles = new ControlsCtor(camera, renderizador.domElement);
  controles.target.set(0, 1.5, 0);
  controles.enableDamping = true;
  controles.dampingFactor = 0.07;

  cena.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));
  const luzDirecional = new THREE.DirectionalLight(0xffffff, 0.8);
  luzDirecional.position.set(3, 10, 5);
  cena.add(luzDirecional);

  const composer = new THREE.EffectComposer(renderizador);
  composer.addPass(new THREE.RenderPass(cena, camera));

  const outlinePass = new THREE.OutlinePass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    cena,
    camera
  );
  outlinePass.edgeStrength = 0;
  outlinePass.edgeGlow = 1;
  outlinePass.edgeThickness = 2;
  outlinePass.visibleEdgeColor.set('#00ffff');
  outlinePass.hiddenEdgeColor.set('#00ffff');
  composer.addPass(outlinePass);

  const fxaaPass = new THREE.ShaderPass(THREE.FXAAShader);
  fxaaPass.uniforms['resolution'].value.set(
    1 / container.clientWidth,
    1 / container.clientHeight
  );
  composer.addPass(fxaaPass);

  const MTLCtor = resolveCtor('MTLLoader');
  const OBJCtor = resolveCtor('OBJLoader');

  let alturaAtual = 0;
  const margem = 0;
  const objetosCarregados = [];

  function carregarCubo(objPath, mtlPath) {
    const carregadorMtl = new MTLCtor();
    carregadorMtl.load(mtlPath, (materiais) => {
      materiais.preload();
      const carregadorObj = new OBJCtor();
      try { carregadorObj.setMaterials(materiais); } catch (e) {}

      carregadorObj.load(objPath, (objeto) => {
        const caixa = new THREE.Box3().setFromObject(objeto);
        const tamanho = caixa.getSize(new THREE.Vector3());
        const centro = caixa.getCenter(new THREE.Vector3());
        objeto.position.x -= centro.x;
        objeto.position.z -= centro.z;

        const maiorDim = Math.max(tamanho.x, tamanho.y, tamanho.z);
        if (maiorDim > 0) objeto.scale.multiplyScalar(1.6 / maiorDim);

        const caixaEscalada = new THREE.Box3().setFromObject(objeto);
        const altura = caixaEscalada.getSize(new THREE.Vector3()).y;

        objeto.position.y = alturaAtual;
        alturaAtual += altura + margem;

        objeto.traverse((filho) => {
          if (filho.isMesh) {
            if (!filho.material) {
              filho.material = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
            }
            filho.material.side = THREE.FrontSide;
            filho.receiveShadow = true;
          }
        });

        cena.add(objeto);
        objetosCarregados.push(objeto);
      });
    });
  }

  carregarCubo('modelos/CuboPreto.obj', 'modelos/CuboPreto.mtl');
  carregarCubo('modelos/CuboBaguncado.obj', 'modelos/CuboBaguncado.mtl');
  carregarCubo('modelos/CuboColorido.obj', 'modelos/CuboColorido.mtl');

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let objetoSelecionado = null;
  let tempo = 0;
  let intensidadeAtual = 0;

  // Texto 3D
  const fontLoader = new THREE.FontLoader();
  let font = null;
  let textoMesh = null;

  fontLoader.load(
    "https://threejs.org/examples/fonts/helvetiker_regular.typeface.json",
    (loadedFont) => { font = loadedFont; }
  );

  function criarTexto3D(texto) {
    if (!font) return null;
    const geometriaTexto = new THREE.TextGeometry(texto, {
      font: font,
      size: 0.2,
      height: 0.05,
      curveSegments: 6,
      bevelEnabled: false,
    });
    const materialTexto = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const meshTexto = new THREE.Mesh(geometriaTexto, materialTexto);
    meshTexto.name = "hoverText";
    return meshTexto;
  }

  function onMouseMove(event) {
    const rect = container.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }
  window.addEventListener('mousemove', onMouseMove, false);

  function animar() {
    requestAnimationFrame(animar);
    controles.update();

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(objetosCarregados, true);

    if (intersects.length > 0) {
      let rootObj = intersects[0].object;
      while (rootObj.parent && !objetosCarregados.includes(rootObj)) {
        rootObj = rootObj.parent;
      }
      if (objetoSelecionado !== rootObj) {
        // se mudou de cubo, remove texto anterior
        if (textoMesh) {
          cena.remove(textoMesh);
          textoMesh = null;
        }
      }
      objetoSelecionado = rootObj;
    } else {
      objetoSelecionado = null;
    }

    if (objetoSelecionado) {
      tempo += 0.05;
      const onda = 6 + Math.sin(tempo * 4) * 3;
      intensidadeAtual += (onda - intensidadeAtual) * 0.1;
      outlinePass.edgeStrength = intensidadeAtual;
      outlinePass.selectedObjects = [objetoSelecionado];

      // adiciona texto acima do cubo
      if (!textoMesh && font) {
        textoMesh = criarTexto3D("");
        const caixa = new THREE.Box3().setFromObject(objetoSelecionado);
        const topo = caixa.max.y;
        textoMesh.position.set(0, topo + 0.3, 0);
        cena.add(textoMesh);
      }
    } else {
      intensidadeAtual += (0 - intensidadeAtual) * 0.1;
      outlinePass.edgeStrength = intensidadeAtual;
      if (intensidadeAtual < 0.05) {
        outlinePass.selectedObjects = [];
      }
      if (textoMesh) {
        cena.remove(textoMesh);
        textoMesh = null;
      }
    }

    composer.render();
  }
  animar();

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderizador.setSize(container.clientWidth, container.clientHeight);
    composer.setSize(container.clientWidth, container.clientHeight);
  });

  // --- Desativa botão direito ---
  window.addEventListener("contextmenu", (e) => e.preventDefault());
}

function initWhenReady(timeoutMs = 3000) {
  const allDefined = () => {
    if (typeof THREE === 'undefined') return false;
    return resolveCtor('OrbitControls') && resolveCtor('OBJLoader') && resolveCtor('MTLLoader');
  };

  if (allDefined()) { startApp(); return; }

  let waited = 0;
  const step = 100;
  const interval = setInterval(() => {
    if (allDefined()) {
      clearInterval(interval);
      startApp();
    } else if ((waited += step) >= timeoutMs) {
      clearInterval(interval);
      console.error('three.js (ou OrbitControls/OBJLoader/MTLLoader) não carregou no tempo esperado.');
    }
  }, step);
}

document.addEventListener('DOMContentLoaded', () => initWhenReady());
