// Configuración indispensable para activar el protocolo de lectura de PMTiles en MapLibre
const protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

let capaActual = 'topo';
let coordenadasUsuario = null;
let rumboActual = 0;
let modoSeguimiento = 0; 
let gpxGeojsonData = null; 
let datosPerfil = []; 
let miGrafico = null;
let ultimoIndiceCercano = 0; 

const mapaBaseEstilo = {
    "version": 8,
    "sources": {
        "topo-source": {
            "type": "raster",
            "tiles": ["https://tile.opentopomap.org/{z}/{x}/{y}.png"],
            "tileSize": 256,
            "attribution": "© OpenTopoMap"
        },
        "sat-source": {
            "type": "raster",
            "tiles": ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
            "tileSize": 256,
            "attribution": "© Esri"
        }
    },
    "layers": [
        { "id": "sat-layer", "type": "raster", "source": "sat-source", "layout": { "visibility": "none" } },
        { "id": "topo-layer", "type": "raster", "source": "topo-source", "layout": { "visibility": "visible" } }
    ]
};

const map = new maplibregl.Map({
    container: 'map',
    style: mapaBaseEstilo,
    center: [-3.7037, 40.4167],
    zoom: 6,
    maxZoom: 17
});

const elFlecha = document.createElement('div');
elFlecha.className = 'gpx-flecha-usuario';
const marcadorUsuario = new maplibregl.Marker({ element: elFlecha, rotationAlignment: 'map' }).setLngLat([0, 0]);

map.on('load', () => {
    marcadorUsuario.addTo(map);
});

function alternarCapa() {
    if (capaActual === 'topo') {
        map.setLayoutProperty('topo-layer', 'visibility', 'none');
        map.setLayoutProperty('sat-layer', 'visibility', 'visible');
        capaActual = 'sat';
        document.getElementById('btn-capa').innerText = '🛰️';
    } else {
        map.setLayoutProperty('sat-layer', 'visibility', 'none');
        map.setLayoutProperty('topo-layer', 'visibility', 'visible');
        capaActual = 'topo';
        document.getElementById('btn-capa').innerText = '⛰️';
    }
}

function alternarPanelAltitud() {
    const panel = document.getElementById('panel-altitud');
    const btn = document.getElementById('btn-altitud');
    panel.classList.toggle('abierto');
    btn.classList.toggle('btn-activo');
    setTimeout(() => { if(miGrafico) miGrafico.resize(); }, 150);
}

function conmutarModoSeguimiento() {
    modoSeguimiento = (modoSeguimiento + 1) % 3;
    const btn = document.getElementById('btn-brujula');
    if (modoSeguimiento === 0) {
        btn.innerText = "🧭"; btn.classList.remove('btn-activo');
        map.setBearing(0); map.setPitch(0); 
    } else if (modoSeguimiento === 1) {
        btn.innerText = "📍"; btn.classList.add('btn-activo');
        map.setPitch(0);
        if (coordenadasUsuario) map.easeTo({ center: coordenadasUsuario, zoom: 16, duration: 800 });
    } else if (modoSeguimiento === 2) {
        btn.innerText = "🏃‍♂️"; btn.classList.add('btn-activo');
        map.setPitch(45);
        solicitarPermisoOrientacion(); 
    }
}

navigator.geolocation.watchPosition(function(pos) {
    coordenadasUsuario = [pos.coords.longitude, pos.coords.latitude];
    marcadorUsuario.setLngLat(coordenadasUsuario);

    if (pos.coords.heading !== null && !isNaN(pos.coords.heading)) {
        rumboActual = pos.coords.heading;
        actualizarOrientacion();
    }
    if (modoSeguimiento >= 1) {
        map.easeTo({ center: coordenadasUsuario, duration: 400, essential: true });
    }
    if (datosPerfil.length > 0) {
        actualizarPuntoGrafico(coordenadasUsuario);
    }
}, function(err) { console.error(err); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 });

function solicitarPermisoOrientacion() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(response => {
            if (response === 'granted') window.addEventListener('deviceorientation', manejarOrientacion, true);
        }).catch(console.error);
    } else {
        window.addEventListener('deviceorientation', manejarOrientacion, true);
    }
}

function manejarOrientacion(event) {
    let rumbo = event.webkitCompassHeading || event.alpha;
    if (rumbo !== null && rumbo !== undefined) {
        if(!event.webkitCompassHeading) rumbo = 360 - rumbo;
        rumboActual = rumbo;
        actualizarOrientacion();
    }
}

function actualizarOrientacion() {
    if (modoSeguimiento === 2) {
        marcadorUsuario.setRotation(0);
        map.setBearing(rumboActual);
    } else {
        marcadorUsuario.setRotation(rumboActual);
    }
}

// Lector de archivos GPX
document.getElementById('file-input').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(evt.target.result, "text/xml");
        gpxGeojsonData = toGeoJSON.gpx(xmlDoc); 
        dibujarRuta(gpxGeojsonData);
        procesarAltimetria(xmlDoc);
        ultimoIndiceCercano = 0;

        const coordinates = gpxGeojsonData.features[0].geometry.coordinates;
        const bounds = coordinates.reduce((b, coord) => b.extend(coord), new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
        map.fitBounds(bounds, { padding: 40 });
    };
    reader.readAsText(file);
});

// Lector e inyector de mapas locales PMTiles
document.getElementById('map-input').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const blobSource = new pmtiles.BlobSource(file);
    const p = new pmtiles.PMTiles(blobSource);
    protocol.add(p); 

    p.getHeader().then(header => {
        if (map.getLayer('capa-offline')) map.removeLayer('capa-offline');
        if (map.getSource('fuente-offline')) map.removeSource('fuente-offline');

        map.setLayoutProperty('topo-layer', 'visibility', 'none');
        map.setLayoutProperty('sat-layer', 'visibility', 'none');

        if (header.tileType === 1) {
            map.addSource('fuente-offline', {
                type: 'vector',
                url: `pmtiles://${p.url}`
            });
            map.addLayer({
                id: 'capa-offline',
                type: 'line',
                source: 'fuente-offline',
                'source-layer': 'basemap', 
                paint: { 'line-color': '#757575', 'line-width': 1.5 }
            }, map.getLayer('ruta-linea') ? 'ruta-linea' : undefined);
        } else {
            map.addSource('fuente-offline', {
                type: 'raster',
                url: `pmtiles://${p.url}`,
                tileSize: 256
            });
            map.addLayer({
                id: 'capa-offline',
                type: 'raster',
                source: 'fuente-offline'
            }, map.getLayer('ruta-linea') ? 'ruta-linea' : undefined);
        }

        document.getElementById('label-mapa').classList.add('btn-activo');

        if (header.minLon !== undefined) {
            map.fitBounds([header.minLon, header.minLat, header.maxLon, header.maxLat], { padding: 40 });
        }
    }).catch(err => {
        alert("Error leyendo el mapa PMTiles: " + err.message);
    });
});

function dibujarRuta(geoJsonData) {
    if (map.getLayer('ruta-linea')) map.removeLayer('ruta-linea');
    if (map.getSource('ruta')) map.removeSource('ruta');
    map.addSource('ruta', { type: 'geojson', data: geoJsonData });
    map.addLayer({
        'id': 'ruta-linea', 'type': 'line', 'source': 'ruta',
        'layout': { 'line-join': 'round', 'line-cap': 'round' },
        'paint': { 'line-color': '#0055ff', 'line-width': 6, 'line-opacity': 0.85 }
    });
}

function calcularDistanciaKms(lon1, lat1, lon2, lat2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function procesarAltimetria(xml) {
    const trkpts = xml.getElementsByTagName("trkpt");
    datosPerfil = [];
    let distanciaAcumulada = 0;

    for (let i = 0; i < trkpts.length; i++) {
        const lat = parseFloat(trkpts[i].getAttribute("lat"));
        const lon = parseFloat(trkpts[i].getAttribute("lon"));
        const eleNode = trkpts[i].getElementsByTagName("ele")[0];
        const altitud = eleNode ? parseFloat(eleNode.textContent) : 0;

        if (i > 0) {
            const latPrev = parseFloat(trkpts[i-1].getAttribute("lat"));
            const lonPrev = parseFloat(trkpts[i-1].getAttribute("lon"));
            distanciaAcumulada += calcularDistanciaKms(lonPrev, latPrev, lon, lat);
        }

        datosPerfil.push({
            x: parseFloat(distanciaAcumulada.toFixed(2)), 
            y: Math.round(altitud),                      
            lat: lat, lon: lon
        });
    }
    inicializarGrafico();
}

function inicializarGrafico() {
    if (miGrafico) miGrafico.destroy();
    const ctx = document.getElementById('graficoAltitud').getContext('2d');
    miGrafico = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Perfil (m)', data: datosPerfil,
                borderColor: '#007aff', backgroundColor: 'rgba(0, 122, 255, 0.12)',
                borderWidth: 2, fill: true, pointRadius: 0, tension: 0.1
            }, {
                label: 'Tú', data: [], 
                borderColor: '#ff3b30', backgroundColor: '#ff3b30',
                pointRadius: 7, pointHoverRadius: 7, showLine: false
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { type: 'linear', grid: { display: false } },
                y: { grid: { color: 'rgba(0,0,0,0.05)' } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function actualizarPuntoGrafico(coordsGPS) {
    if (!miGrafico || datosPerfil.length === 0) return;
    let indiceMasCercano = ultimoIndiceCercano;
    let distanciaMinima = Infinity;
    let inicio = Math.max(0, ultimoIndiceCercano - 15);
    let fin = Math.min(datosPerfil.length, ultimoIndiceCercano + 15);

    if (ultimoIndiceCercano === 0) { inicio = 0; fin = datosPerfil.length; }

    for (let i = inicio; i < fin; i++) {
        const d = Math.pow(datosPerfil[i].lon - coordsGPS[0], 2) + Math.pow(datosPerfil[i].lat - coordsGPS[1], 2);
        if (d < distanciaMinima) { distanciaMinima = d; indiceMasCercano = i; }
    }

    if ((indiceMasCercano === inicio || indiceMasCercano === fin - 1) && ultimoIndiceCercano !== 0) {
        for (let i = 0; i < datosPerfil.length; i++) {
            const d = Math.pow(datosPerfil[i].lon - coordsGPS[0], 2) + Math.pow(datosPerfil[i].lat - coordsGPS[1], 2);
            if (d < distanciaMinima) { distanciaMinima = d; indiceMasCercano = i; }
        }
    }

    ultimoIndiceCercano = indiceMasCercano;
    const puntoRuta = datosPerfil[indiceMasCercano];
    miGrafico.data.datasets[1].data = [{ x: puntoRuta.x, y: puntoRuta.y }];
    miGrafico.update('none'); 
}

// Registro del Service Worker para soporte offline
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { 
        navigator.serviceWorker.register('./sw.js')
            .then(() => console.log("Service Worker registrado con éxito"))
            .catch((err) => console.error("SW Error:", err)); 
    });
}