// Configuración indispensable para activar el protocolo de lectura de PMTiles en MapLibre
const protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

let capaActual = 'topo'; // Puede ser 'topo', 'sat', 'osm' o 'offline'
let coordenadasUsuario = null;
let rumboActual = 0;
let modoSeguimiento = 0;
let gpxGeojsonData = null;
let datosPerfil = [];
let miGrafico = null;
let modoOffline = false;
let ultimoIndiceCercano = 0;

let puntoMasAlto = null;
let indicePuntoMasAlto = 0;

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
        },
        "osm-source": {
            "type": "raster",
            "tiles": ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            "tileSize": 256,
            "attribution": "© OpenStreetMap"
        }
    },
    "layers": [
        { "id": "sat-layer", "type": "raster", "source": "sat-source", "layout": { "visibility": "none" } },
        { "id": "topo-layer", "type": "raster", "source": "topo-source", "layout": { "visibility": "visible" } },
        { "id": "osm-layer", "type": "raster", "source": "osm-source", "layout": { "visibility": "none" } }
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

// Marcador de seguimiento (se mueve cuando el usuario pasa el dedo/ratón por el perfil)
const elSeguimiento = document.createElement('div');
elSeguimiento.style.width = '14px';
elSeguimiento.style.height = '14px';
elSeguimiento.style.borderRadius = '50%';
elSeguimiento.style.backgroundColor = '#fff';
elSeguimiento.style.border = '3px solid #3b82f6';
elSeguimiento.style.boxShadow = '0 0 8px rgba(0,0,0,0.3)';
elSeguimiento.style.display = 'none';
const marcadorSeguimiento = new maplibregl.Marker({ element: elSeguimiento }).setLngLat([0, 0]).addTo(map);

// OPTIMIZACIÓN IPHONE: Se usa 'viewport' para evitar el retraso o salto de transformación en iOS Safari
const marcadorUsuario = new maplibregl.Marker({ element: elFlecha, rotationAlignment: 'viewport' }).setLngLat([0, 0]);

map.on('load', () => {
    marcadorUsuario.addTo(map);
});

function alternarCapa() {
    const tieneOffline = !!map.getSource('fuente-offline');

    // Ocultamos todas las capas base primero
    map.setLayoutProperty('topo-layer', 'visibility', 'none');
    map.setLayoutProperty('sat-layer', 'visibility', 'none');
    map.setLayoutProperty('osm-layer', 'visibility', 'none');
    if (map.getLayer('capa-offline')) map.setLayoutProperty('capa-offline', 'visibility', 'none');

    if (capaActual === 'topo') {
        map.setLayoutProperty('sat-layer', 'visibility', 'visible');
        capaActual = 'sat';
        document.getElementById('btn-capa').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 7 9 3 5 7l4 4Z"/><path d="m17 11 4 4-4 4-4-4Z"/><path d="m4.5 15.5 2 2"/><path d="m15.5 4.5 2 2"/><path d="M2 12h2"/><path d="M12 2v2"/><path d="M20 12h2"/><path d="M12 20v2"/><path d="m17 7-5 5"/><path d="m7 17 5-5"/></svg>';
        modoOffline = false;
    } else if (capaActual === 'sat') {
        map.setLayoutProperty('osm-layer', 'visibility', 'visible');
        capaActual = 'osm';
        document.getElementById('btn-capa').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" x2="9" y1="3" y2="18"/><line x1="15" x2="15" y1="6" y2="21"/></svg>';
        modoOffline = false;
    } else if (capaActual === 'osm') {
        if (tieneOffline) {
            activarModoOffline();
        } else {
            map.setLayoutProperty('topo-layer', 'visibility', 'visible');
            capaActual = 'topo';
            document.getElementById('btn-capa').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>';
            modoOffline = false;
        }
    } else {
        // Venimos de 'offline', volvemos a empezar el ciclo
        map.setLayoutProperty('topo-layer', 'visibility', 'visible');
        capaActual = 'topo';
        document.getElementById('btn-capa').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>';
        desactivarModoOffline();
    }
}

/**
 * Alterna la visibilidad entre el mapa offline cargado (PMTiles) y los mapas online.
 */
function alternarModoOffline() {
    if (!map.getSource('fuente-offline')) {
        alert("Primero selecciona un archivo de mapa (.pmtiles)");
        return;
    }
    if (modoOffline) desactivarModoOffline();
    else activarModoOffline();
}

function activarModoOffline() {
    modoOffline = true;
    capaActual = 'offline';
    map.setLayoutProperty('topo-layer', 'visibility', 'none');
    map.setLayoutProperty('sat-layer', 'visibility', 'none');
    map.setLayoutProperty('osm-layer', 'visibility', 'none');
    if (map.getLayer('capa-offline')) map.setLayoutProperty('capa-offline', 'visibility', 'visible');
    document.getElementById('label-mapa').classList.add('btn-activo');
    document.getElementById('btn-capa').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 18h.01"/><path d="M10 18h.01"/><path d="M2 10V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4"/></svg>';
}

function desactivarModoOffline() {
    modoOffline = false;
    // La visibilidad se gestiona ahora principalmente en alternarCapa para evitar conflictos
    if (map.getLayer('capa-offline')) map.setLayoutProperty('capa-offline', 'visibility', 'none');
    document.getElementById('label-mapa').classList.remove('btn-activo');
}

function alternarPanelAltitud() {
    const panel = document.getElementById('panel-altitud');
    const btn = document.getElementById('btn-altitud');
    panel.classList.toggle('abierto');
    btn.classList.toggle('btn-activo');
    setTimeout(() => { if (miGrafico) miGrafico.resize(); }, 150);
}

function conmutarModoSeguimiento() {
    modoSeguimiento = (modoSeguimiento + 1) % 3;
    const btn = document.getElementById('btn-brujula');
    if (modoSeguimiento === 0) {
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>';
        btn.classList.remove('btn-activo');
        map.setBearing(0); map.setPitch(0);
        actualizarOrientacion();
    } else if (modoSeguimiento === 1) {
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';
        btn.classList.add('btn-activo');
        map.setPitch(0);
        if (coordenadasUsuario) map.easeTo({ center: coordenadasUsuario, zoom: 16, duration: 800 });
        solicitarPermisoOrientacion(); // OPTIMIZACIÓN IPHONE: Solicita permiso aquí para activar la brújula desde ya
    } else if (modoSeguimiento === 2) {
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>';
        btn.classList.add('btn-activo');
        map.setPitch(45);
        solicitarPermisoOrientacion();
    }
}

navigator.geolocation.watchPosition(function (pos) {
    coordenadasUsuario = [pos.coords.longitude, pos.coords.latitude];
    marcadorUsuario.setLngLat(coordenadasUsuario);

    if (pos.coords.heading !== null && !isNaN(pos.coords.heading) && pos.coords.heading !== undefined) {
        if (modoSeguimiento < 2) {
            rumboActual = pos.coords.heading;
            actualizarOrientacion();
        }
    }
    if (modoSeguimiento >= 1) {
        map.easeTo({ center: coordenadasUsuario, duration: 400, essential: true });
    }
    if (datosPerfil.length > 0) {
        actualizarPuntoGrafico(coordenadasUsuario);
    }
}, function (err) { console.error(err); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 });

function solicitarPermisoOrientacion() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        // Bloque nativo para iOS (iPhone)
        DeviceOrientationEvent.requestPermission().then(response => {
            if (response === 'granted') {
                window.removeEventListener('deviceorientation', manejarOrientacion, true);
                window.addEventListener('deviceorientation', manejarOrientacion, true);
            }
        }).catch(console.error);
    } else {
        // Bloque para Android y otros dispositivos
        if ('ondeviceorientationabsolute' in window) {
            window.addEventListener('deviceorientationabsolute', manejarOrientacion, true);
        } else {
            window.addEventListener('deviceorientation', manejarOrientacion, true);
        }
    }
}

function manejarOrientacion(event) {
    let rumbo = null;

    if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
        rumbo = event.webkitCompassHeading; // Rumbo nativo de brújula calibrada en iOS
    }
    else if (event.alpha !== undefined && event.alpha !== null) {
        if (event.absolute === true || event.type === 'deviceorientationabsolute') {
            rumbo = 360 - event.alpha;
        }
    }

    if (rumbo !== null && !isNaN(rumbo)) {
        rumboActual = rumbo;
        actualizarOrientacion();
    }
}

function actualizarOrientacion() {
    if (modoSeguimiento === 2) {
        map.setBearing(rumboActual);
        marcadorUsuario.setRotation(0); // Al usar viewport, 0 significa que siempre apunta recto hacia adelante en la pantalla
    } else {
        // Corregimos el rumbo restando el bearing actual del mapa por si el usuario lo rota con los dedos
        marcadorUsuario.setRotation(rumboActual - map.getBearing());
    }
}

// Escucha si el usuario rota el mapa manualmente en modo libre para corregir la flecha en tiempo real
map.on('rotate', () => {
    if (modoSeguimiento < 2) {
        actualizarOrientacion();
    }
});

// Lector de archivos GPX
document.getElementById('file-input').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
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
document.getElementById('map-input').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const blobSource = new pmtiles.BlobSource(file);
    const p = new pmtiles.PMTiles(blobSource);
    protocol.add(p);

    console.log("Intentando cargar PMTiles:", file.name);

    p.getHeader().then(header => {
        console.log("✅ PMTiles cargado correctamente:", header);

        if (map.getLayer('capa-offline')) map.removeLayer('capa-offline');
        if (map.getSource('fuente-offline')) map.removeSource('fuente-offline');

        activarModoOffline();

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

        if (header.minLon !== undefined) {
            map.fitBounds([header.minLon, header.minLat, header.maxLon, header.maxLat], { padding: 40 });
        }
    }).catch(err => {
        console.error("❌ Error al cargar PMTiles:", err);
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
        'paint': { 'line-color': '#3b82f6', 'line-width': 5, 'line-opacity': 0.9 }
    });
}

function calcularDistanciaKms(lon1, lat1, lon2, lat2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function procesarAltimetria(xml) {
    const trkpts = xml.getElementsByTagName("trkpt");
    datosPerfil = [];
    let distanciaAcumulada = 0;
    let gainAcumulado = 0;
    let lossAcumulado = 0;
    let maxAltitud = -Infinity;
    indicePuntoMasAlto = 0;

    for (let i = 0; i < trkpts.length; i++) {
        const lat = parseFloat(trkpts[i].getAttribute("lat"));
        const lon = parseFloat(trkpts[i].getAttribute("lon"));
        const eleNode = trkpts[i].getElementsByTagName("ele")[0];
        const altitud = eleNode ? Math.round(parseFloat(eleNode.textContent)) : 0;

        if (i > 0) {
            const latPrev = parseFloat(trkpts[i - 1].getAttribute("lat"));
            const lonPrev = parseFloat(trkpts[i - 1].getAttribute("lon"));
            distanciaAcumulada += calcularDistanciaKms(lonPrev, latPrev, lon, lat);

            const diff = altitud - datosPerfil[i - 1].y;
            if (diff > 0) gainAcumulado += diff;
            else lossAcumulado += Math.abs(diff);
        }

        const punto = {
            x: parseFloat(distanciaAcumulada.toFixed(2)),
            y: altitud,
            gain: gainAcumulado,
            loss: lossAcumulado,
            lat: lat, lon: lon
        };

        datosPerfil.push(punto);

        if (punto.y > maxAltitud) {
            maxAltitud = punto.y;
            indicePuntoMasAlto = i;
        }
    }

    if (datosPerfil.length > 0) {
        puntoMasAlto = datosPerfil[indicePuntoMasAlto];
        document.getElementById('hud-ruta').style.display = 'block';
        actualizarHudPuntoAlto(0);
    } else {
        puntoMasAlto = null;
        document.getElementById('hud-ruta').style.display = 'none';
    }

    inicializarGrafico();
}

function actualizarHudPuntoAlto(indiceActual) {
    if (!datosPerfil.length || !puntoMasAlto) return;
    const elHud = document.getElementById('hud-ruta');
    const puntoRuta = datosPerfil[indiceActual];

    if (indiceActual <= indicePuntoMasAlto) {
        const distCima = Math.max(0, puntoMasAlto.x - puntoRuta.x);
        const altCima = Math.max(0, puntoMasAlto.y - puntoRuta.y);
        elHud.innerHTML = `
            <div style="width: 100%; font-family: system-ui, -apple-system, sans-serif; text-align: center;">
                <div style="opacity: 0.6; font-size: 10px; font-weight: 700; text-transform: uppercase; margin-bottom: 2px;">Distancia y Desnivel a Cima (${puntoMasAlto.y}m)</div>
                <div style="display: flex; justify-content: center; align-items: baseline; gap: 20px;">
                    <span style="font-size: 20px; font-weight: 700;">${distCima.toFixed(2)}<small style="font-size: 12px; color: #888; font-weight: 400; margin-left: 2px;">km</small></span>
                    <span style="font-size: 20px; font-weight: 700; color: #007aff;">+${altCima}<small style="font-size: 12px; color: #007aff; font-weight: 400; margin-left: 2px;">m</small></span>
                </div>
            </div>`;
    } else {
        elHud.innerHTML = `
            <div style="width: 100%; text-align: center; color: #10b981; font-size: 12px; font-weight: 800; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; gap: 5px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> CIMA SUPERADA
            </div>`;
    }
}

function inicializarGrafico() {
    if (miGrafico) miGrafico.destroy();

    let yMin, yMax;
    if (datosPerfil.length > 0) {
        const alts = datosPerfil.map(p => p.y);
        const min = Math.min(...alts);
        const max = Math.max(...alts);
        if (max - min < 100) {
            const centro = (max + min) / 2;
            yMin = centro - 50;
            yMax = centro + 50;
        }
    }

    const ctx = document.getElementById('graficoAltitud').getContext('2d');
    miGrafico = new Chart(ctx, {
        type: 'line',
        plugins: [{
            id: 'posicionActualDecoracion',
            afterDatasetsDraw(chart) {
                const { ctx, data, chartArea: { top, bottom } } = chart;
                const dsPunto = data.datasets[2];
                if (!dsPunto || !dsPunto.data || dsPunto.data.length === 0 || !datosPerfil.length) return;

                const metaPoint = chart.getDatasetMeta(2).data[0];
                if (!metaPoint) return;

                // Dibujar línea vertical indicadora
                ctx.save();
                ctx.beginPath();
                ctx.setLineDash([5, 5]);
                ctx.moveTo(metaPoint.x, top);
                ctx.lineTo(metaPoint.x, bottom);
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(255, 59, 48, 0.5)';
                ctx.stroke();
                ctx.restore();

                const totalDist = datosPerfil[datosPerfil.length - 1].x;
                const recorrido = dsPunto.data[0].x.toFixed(2);
                const falta = Math.max(0, totalDist - dsPunto.data[0].x).toFixed(2);
                const texto = `${recorrido}km / -${falta}km`;

                ctx.save();
                ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
                const textWidth = ctx.measureText(texto).width;

                let xPos = metaPoint.x + 12;
                // Si la etiqueta se sale por la derecha, la dibujamos a la izquierda del punto
                if (xPos + textWidth > chart.width) xPos = metaPoint.x - textWidth - 12;

                ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                ctx.fillRect(xPos - 4, metaPoint.y - 18, textWidth + 8, 16);
                ctx.fillStyle = '#ff3b30';
                ctx.fillText(texto, xPos, metaPoint.y - 6);
                ctx.restore();
            }
        }],
        data: {
            datasets: [{
                label: 'Perfil (m)', data: datosPerfil,
                borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.08)',
                borderWidth: 1.5, fill: true, pointRadius: 0, tension: 0.2
            }, {
                label: 'Progreso', data: [],
                borderColor: 'transparent', backgroundColor: 'rgba(59, 130, 246, 0.4)',
                fill: true, pointRadius: 0, tension: 0.2
            }, {
                label: 'Tú', data: [],
                borderColor: '#ff3b30', backgroundColor: '#ff3b30',
                pointRadius: 8,
                pointHoverRadius: 8,
                showLine: false,
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            onHover: (event, activeElements) => {
                if (activeElements.length > 0) {
                    const index = activeElements[0].index;
                    const punto = datosPerfil[index];
                    if (punto) {
                        marcadorSeguimiento.setLngLat([punto.lon, punto.lat]);
                        elSeguimiento.style.display = 'block';
                    }
                } else {
                    elSeguimiento.style.display = 'none';
                }
            },
            scales: {
                x: { type: 'linear', grid: { display: false } },
                y: {
                    min: yMin,
                    max: yMax,
                    grid: { color: 'rgba(0,0,0,0.05)' }
                }
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

    // Guardamos el índice real para optimizar la búsqueda en el siguiente tick del GPS
    ultimoIndiceCercano = indiceMasCercano;

    // Si la distancia al punto más cercano es mayor a ~250m (aprox 0.0025 grados),
    // forzamos la posición al inicio del perfil (índice 0).
    let indiceAMostrar = indiceMasCercano;
    if (distanciaMinima > 0.00000625) { indiceAMostrar = 0; }

    const puntoRuta = datosPerfil[indiceAMostrar];
    miGrafico.data.datasets[1].data = datosPerfil.slice(0, indiceAMostrar + 1);
    miGrafico.data.datasets[2].data = [{ x: puntoRuta.x, y: puntoRuta.y }];
    miGrafico.update('none');
    actualizarHudPuntoAlto(indiceAMostrar);
}

// Registro del Service Worker para soporte offline
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(() => console.log("Service Worker registrado con éxito"))
            .catch((err) => console.error("SW Error:", err));
    });
}