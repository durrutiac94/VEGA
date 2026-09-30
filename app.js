(function () {
  'use strict';

  const RUTA_DATOS = 'data/precios_odepa.json';
  const CLAVE_PREFERENCIAS = 'fruver.preferencias.v1';
  const CLAVE_GUARDADOS = 'fruver.guardados.v1';
  const TAMANO_LOTE = 40;
  const RETARDO_BUSQUEDA = 180;

  const formateadorNumero = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });
  const formateadorFecha = new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
  const comparadorTexto = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

  const estado = {
    productos: [],
    mercados: [],
    resultados: [],
    guardados: new Set(),
    ampliados: new Set(),
    filtros: { busqueda: '', mercado: '', orden: 'promedio-asc', soloGuardados: false },
    hayGuardados: false,
    generacion: 0,
    cargando: true
  };

  const nodos = {};
  const consultaPantallaAncha = window.matchMedia('(min-width: 768px)');
  let temporizadorBusqueda = null;

  function aNumero(valor) {
    if (typeof valor === 'number') {
      return Number.isFinite(valor) ? valor : NaN;
    }
    if (valor === null || valor === undefined) {
      return NaN;
    }
    const limpio = String(valor).replace(/[^\d.-]/g, '');
    if (limpio === '' || limpio === '.' || limpio === '-') {
      return NaN;
    }
    const resultado = Number(limpio);
    return Number.isFinite(resultado) ? resultado : NaN;
  }

  function normalizar(texto) {
    return String(texto === null || texto === undefined ? '' : texto)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function textoLimpio(valor) {
    return String(valor === null || valor === undefined ? '' : valor).trim();
  }

  function formatearMonto(valor) {
    return Number.isFinite(valor) ? '$ ' + formateadorNumero.format(Math.round(valor)) : '—';
  }

  function formatearPorcentaje(valor) {
    return Number.isFinite(valor) ? formateadorNumero.format(Math.round(valor * 100)) + '%' : '—';
  }

  function formatearFecha(iso) {
    const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!partes) {
      return 'Fecha no informada';
    }
    return formateadorFecha.format(new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])));
  }

  function leerAlmacenamiento(clave, valorPorDefecto) {
    try {
      const crudo = window.localStorage.getItem(clave);
      return crudo === null ? valorPorDefecto : JSON.parse(crudo);
    } catch (error) {
      return valorPorDefecto;
    }
  }

  function escribirAlmacenamiento(clave, valor) {
    try {
      window.localStorage.setItem(clave, JSON.stringify(valor));
      return true;
    } catch (error) {
      return false;
    }
  }

  function crearElemento(etiqueta, clases, texto) {
    const elemento = document.createElement(etiqueta);
    if (clases) {
      elemento.className = clases;
    }
    if (texto !== undefined && texto !== null) {
      elemento.textContent = texto;
    }
    return elemento;
  }

  function crearIcono(nombre) {
    const icono = crearElemento('i', 'bi bi-' + nombre);
    icono.setAttribute('aria-hidden', 'true');
    return icono;
  }

  function crearInsignia(clases, texto) {
    return crearElemento('span', 'badge rounded-pill fw-medium ' + clases, texto);
  }

  function construirIndice(registros) {
    const agrupado = new Map();

    for (const registro of registros) {
      if (!registro || typeof registro !== 'object') {
        continue;
      }

      const producto = textoLimpio(registro.producto);
      if (!producto) {
        continue;
      }

      const precio = aNumero(registro.precio_promedio);
      if (!Number.isFinite(precio)) {
        continue;
      }

      const variedad = textoLimpio(registro.variedad);
      const unidad = textoLimpio(registro.unidad);
      const mercado = textoLimpio(registro.mercado);
      const clave = [normalizar(producto), normalizar(variedad), normalizar(unidad)].join('|');

      let item = agrupado.get(clave);
      if (!item) {
        item = {
          clave: clave,
          producto: producto,
          variedad: variedad,
          unidad: unidad,
          precios: [],
          minimos: [],
          maximos: [],
          mercados: new Map(),
          fecha: ''
        };
        agrupado.set(clave, item);
      }

      const minimoRegistro = aNumero(registro.precio_minimo);
      const maximoRegistro = aNumero(registro.precio_maximo);

      item.precios.push(precio);
      item.minimos.push(Number.isFinite(minimoRegistro) ? minimoRegistro : precio);
      item.maximos.push(Number.isFinite(maximoRegistro) ? maximoRegistro : precio);

      const precioEnMercado = item.mercados.get(mercado);
      if (precioEnMercado === undefined || precio < precioEnMercado.precio) {
        item.mercados.set(mercado, { mercado: mercado, precio: precio });
      }

      const fecha = textoLimpio(registro.fecha_boletin);
      if (fecha > item.fecha) {
        item.fecha = fecha;
      }
    }

    const productos = [];
    const mercados = new Set();

    agrupado.forEach(function (item) {
      const minimo = item.minimos.reduce(function (menor, valor) { return valor < menor ? valor : menor; }, Infinity);
      const maximo = item.maximos.reduce(function (mayor, valor) { return valor > mayor ? valor : mayor; }, -Infinity);
      const total = item.precios.reduce(function (acumulado, valor) { return acumulado + valor; }, 0);
      const listaMercados = Array.from(item.mercados.values()).sort(function (a, b) { return a.precio - b.precio; });
      const nombresMercados = new Set();

      for (const entrada of listaMercados) {
        mercados.add(entrada.mercado);
        nombresMercados.add(entrada.mercado);
      }

      productos.push({
        clave: item.clave,
        producto: item.producto,
        variedad: item.variedad,
        unidad: item.unidad,
        minimo: minimo,
        maximo: maximo,
        promedio: total / item.precios.length,
        amplitud: maximo - minimo,
        dispersión: minimo > 0 ? (maximo - minimo) / minimo : 0,
        mercados: listaMercados,
        nombresMercados: nombresMercados,
        cantidadMercados: listaMercados.length,
        mejorMercado: listaMercados.length > 0 ? listaMercados[0].mercado : '',
        fecha: item.fecha,
        busqueda: normalizar(
          [item.producto, item.variedad, item.unidad].concat(listaMercados.map(function (m) { return m.mercado; })).join(' ')
        )
      });
    });

    return {
      productos: productos,
      mercados: Array.from(mercados).sort(comparadorTexto.compare)
    };
  }

  function ordenarProductos(lista) {
    const comparadores = {
      'promedio-asc': function (a, b) { return a.promedio - b.promedio; },
      'promedio-desc': function (a, b) { return b.promedio - a.promedio; },
      'amplitud-desc': function (a, b) { return b.amplitud - a.amplitud; },
      'mercados-desc': function (a, b) { return b.cantidadMercados - a.cantidadMercados; },
      'producto-asc': function (a, b) { return comparadorTexto.compare(a.producto, b.producto); }
    };
    const comparador = comparadores[estado.filtros.orden] || comparadores['promedio-asc'];
    lista.sort(function (a, b) {
      return comparador(a, b) || comparadorTexto.compare(a.producto, b.producto);
    });
  }

  function filtrarProductos() {
    const terminos = normalizar(estado.filtros.busqueda).split(' ').filter(Boolean);
    const mercado = estado.filtros.mercado;
    const soloGuardados = estado.filtros.soloGuardados && estado.hayGuardados;
    const resultados = [];

    for (const item of estado.productos) {
      if (mercado && !item.nombresMercados.has(mercado)) {
        continue;
      }
      if (soloGuardados && !estado.guardados.has(item.clave)) {
        continue;
      }
      if (terminos.length > 0) {
        let coincide = true;
        for (const termino of terminos) {
          if (item.busqueda.indexOf(termino) === -1) {
            coincide = false;
            break;
          }
        }
        if (!coincide) {
          continue;
        }
      }
      resultados.push(item);
    }

    ordenarProductos(resultados);
    estado.resultados = resultados;
  }

  function crearEncabezadoProducto(item) {
    const celda = crearElemento('td');
    const bloque = crearElemento('div', 'lh-sm');
    const insignias = crearElemento('div', 'd-flex flex-wrap gap-1 mt-1');

    bloque.appendChild(crearElemento('span', 'fw-semibold', item.producto));
    if (item.variedad) {
      insignias.appendChild(crearInsignia('text-bg-light border text-body-secondary', item.variedad));
    }
    insignias.appendChild(crearInsignia('text-bg-primary-subtle text-primary-emphasis', 'rango ' + formatearPorcentaje(item.dispersión)));
    bloque.appendChild(insignias);
    celda.appendChild(bloque);
    return celda;
  }

  function crearCeldaMonto(valor, clases) {
    const celda = crearElemento('td', 'text-end text-nowrap ' + clases, formatearMonto(valor));
    return celda;
  }

  function crearCeldaMercados(item) {
    const celda = crearElemento('td');
    const bloque = crearElemento('div', 'lh-sm');
    bloque.appendChild(crearElemento('span', 'fw-semibold', formateadorNumero.format(item.cantidadMercados)));
    bloque.appendChild(crearElemento('div', 'small text-body-secondary', item.cantidadMercados === 1 ? 'mercado' : 'mercados'));
    if (item.mejorMercado) {
      bloque.appendChild(crearElemento('div', 'small text-body-secondary text-truncate', 'mejor en ' + item.mejorMercado));
    }
    celda.appendChild(bloque);
    return celda;
  }

  function crearBotonGuardar(item) {
    const activo = estado.guardados.has(item.clave);
    const boton = crearElemento('button', 'btn btn-sm btn-outline-secondary border-0');
    boton.type = 'button';
    boton.dataset.clave = item.clave;
    boton.setAttribute('aria-pressed', activo ? 'true' : 'false');
    boton.setAttribute('aria-label', (activo ? 'Quitar ' : 'Guardar ') + item.producto + ' de mi lista');
    boton.appendChild(crearIcono(activo ? 'bookmark-fill' : 'bookmark'));
    if (activo) {
      boton.classList.add('favorito-activo');
    }
    boton.addEventListener('click', function () {
      alternarGuardado(item.clave);
    });
    return boton;
  }

  function crearCeldaGuardar(item) {
    const celda = crearElemento('td', 'text-end');
    celda.appendChild(crearBotonGuardar(item));
    return celda;
  }

  function formatearDiferencia(diferencia) {
    if (!Number.isFinite(diferencia) || Math.abs(diferencia) < 1) {
      return { texto: 'igual al promedio', clases: 'text-body-secondary' };
    }
    const signo = diferencia < 0 ? '-' : '+';
    return {
      texto: signo + formatearMonto(Math.abs(diferencia)) + ' vs. promedio',
      clases: diferencia < 0 ? 'text-success-emphasis' : 'text-danger-emphasis'
    };
  }

  function crearDetalleMercados(item) {
    const contenedor = crearElemento('div');

    const resumen = crearElemento('div', 'd-flex flex-wrap justify-content-between gap-2 mb-2 small text-body-secondary');
    resumen.appendChild(crearElemento('span', '', item.cantidadMercados + (item.cantidadMercados === 1 ? ' mercado cotizado' : ' mercados cotizados')));
    resumen.appendChild(crearElemento('span', 'text-nowrap', 'min ' + formatearMonto(item.minimo) + ' · promedio ' + formatearMonto(item.promedio) + ' · máx ' + formatearMonto(item.maximo)));
    contenedor.appendChild(resumen);

    const lista = crearElemento('div', 'list-group list-group-flush');

    item.mercados.forEach(function (entrada, posicion) {
      const fila = crearElemento('div', 'list-group-item bg-transparent px-0');

      const linea = crearElemento('div', 'd-flex flex-wrap justify-content-between align-items-center gap-2');
      const nombre = crearElemento('span', 'lh-sm');
      nombre.appendChild(crearElemento('span', '', entrada.mercado));
      if (posicion === 0) {
        nombre.appendChild(document.createTextNode(' '));
        nombre.appendChild(crearInsignia('text-bg-success', 'mejor precio'));
      } else if (posicion === item.mercados.length - 1 && item.cantidadMercados > 1) {
        nombre.appendChild(document.createTextNode(' '));
        nombre.appendChild(crearInsignia('text-bg-light border text-body-secondary', 'precio más alto'));
      }
      linea.appendChild(nombre);
      linea.appendChild(crearElemento('span', 'fw-semibold text-nowrap', formatearMonto(entrada.precio)));
      fila.appendChild(linea);

      const barra = crearElemento('div', 'barra-rango mt-2 mb-1');
      barra.style.height = '.35rem';
      const relleno = crearElemento('div', 'barra-rango__relleno');
      const avance = item.amplitud > 0 ? (entrada.precio - item.minimo) / item.amplitud : 1;
      relleno.style.width = Math.max(2, Math.min(100, avance * 100)) + '%';
      barra.appendChild(relleno);
      barra.setAttribute('role', 'img');
      barra.setAttribute('aria-label', 'Posición del precio dentro del rango del producto');
      fila.appendChild(barra);

      const pie = crearElemento('div', 'd-flex flex-wrap justify-content-between gap-2 small');
      const diferencia = formatearDiferencia(entrada.precio - item.promedio);
      pie.appendChild(crearElemento('span', diferencia.clases, diferencia.texto));
      pie.appendChild(crearElemento('span', 'text-body-secondary', 'puesto ' + (posicion + 1) + ' de ' + item.cantidadMercados));
      fila.appendChild(pie);

      lista.appendChild(fila);
    });

    contenedor.appendChild(lista);
    return contenedor;
  }

  function crearBotonDetalle(item, idContenedor) {
    const abierto = estado.ampliados.has(item.clave);
    const boton = crearElemento('button', 'btn btn-sm btn-outline-secondary border-0 px-1');
    boton.type = 'button';
    boton.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    boton.setAttribute('aria-controls', idContenedor);
    boton.setAttribute('aria-label', (abierto ? 'Ocultar' : 'Ver') + ' el detalle de los ' + item.cantidadMercados + ' mercados de ' + item.producto);
    boton.title = abierto ? 'Ocultar detalle por mercado' : 'Ver detalle por mercado';
    boton.appendChild(crearIcono('chevron-' + (abierto ? 'up' : 'down')));
    return boton;
  }

  function alternarDetalle(item, boton, elementoVisible, contenido) {
    if (contenido.dataset.construido !== '1') {
      contenido.replaceChildren(crearDetalleMercados(item));
      contenido.dataset.construido = '1';
    }

    const visible = !elementoVisible.classList.contains('d-none');
    elementoVisible.classList.toggle('d-none', visible);
    boton.setAttribute('aria-expanded', visible ? 'false' : 'true');
    boton.setAttribute('aria-label', (visible ? 'Ver' : 'Ocultar') + ' el detalle de los ' + item.cantidadMercados + ' mercados de ' + item.producto);
    boton.title = visible ? 'Ver detalle por mercado' : 'Ocultar detalle por mercado';
    boton.firstChild.className = 'bi bi-chevron-' + (visible ? 'down' : 'up');

    if (visible) {
      estado.ampliados.delete(item.clave);
    } else {
      estado.ampliados.add(item.clave);
    }
  }

  function crearFila(item, indice) {
    const idDetalle = 'detalle-fila-' + indice;
    const abierto = estado.ampliados.has(item.clave);

    const celda = crearElemento('td', 'text-center align-middle');
    const boton = crearBotonDetalle(item, idDetalle);
    celda.appendChild(boton);

    const fila = crearElemento('tr');
    fila.appendChild(celda);
    fila.appendChild(crearEncabezadoProducto(item));
    fila.appendChild(crearElemento('td', 'text-nowrap text-body-secondary small', item.unidad || '—'));
    fila.appendChild(crearCeldaMonto(item.minimo, 'text-success-emphasis'));
    fila.appendChild(crearCeldaMonto(item.promedio, 'fw-semibold'));
    fila.appendChild(crearCeldaMonto(item.maximo, 'text-danger-emphasis'));
    fila.appendChild(crearCeldaMercados(item));
    fila.appendChild(crearCeldaGuardar(item));

    const contenido = crearElemento('td', 'bg-body-tertiary');
    contenido.id = idDetalle;
    contenido.colSpan = 8;
    if (abierto) {
      contenido.appendChild(crearDetalleMercados(item));
      contenido.dataset.construido = '1';
    }

    const filaDetalle = crearElemento('tr', abierto ? '' : 'd-none');
    filaDetalle.appendChild(contenido);

    boton.addEventListener('click', function () {
      alternarDetalle(item, boton, filaDetalle, contenido);
    });

    const contenedor = document.createDocumentFragment();
    contenedor.appendChild(fila);
    contenedor.appendChild(filaDetalle);
    return contenedor;
  }

  function crearBarraRango(item) {
    const contenedor = crearElemento('div', 'barra-rango mb-2');
    const relleno = crearElemento('div', 'barra-rango__relleno');
    const avance = item.amplitud > 0 ? (item.promedio - item.minimo) / item.amplitud : 1;
    relleno.style.width = Math.max(2, Math.min(100, avance * 100)) + '%';
    contenedor.appendChild(relleno);
    contenedor.setAttribute('role', 'img');
    contenedor.setAttribute(
      'aria-label',
      'El precio promedio se ubica un ' + formatearPorcentaje(avance) + ' del rango entre el mínimo y el máximo'
    );
    return contenedor;
  }

  function crearBloqueEstadistico(etiqueta, valor, clases) {
    const bloque = crearElemento('div', 'col-4');
    const caja = crearElemento('div', 'bg-body-tertiary rounded-3 py-2 px-1 h-100');
    caja.appendChild(crearElemento('p', 'small text-body-secondary mb-1', etiqueta));
    caja.appendChild(crearElemento('p', 'fw-semibold mb-0 lh-sm ' + (clases || ''), valor));
    bloque.appendChild(caja);
    return bloque;
  }

  function crearTarjeta(item, indice) {
    const idDetalle = 'detalle-tarjeta-' + indice;
    const abierto = estado.ampliados.has(item.clave);
    const columna = crearElemento('div', 'col-12');
    const tarjeta = crearElemento('article', 'card h-100 shadow-sm tarjeta-producto');
    const cuerpo = crearElemento('div', 'card-body');

    const cabecera = crearElemento('div', 'd-flex justify-content-between align-items-start gap-2 mb-2');
    const izquierda = crearElemento('div', 'd-flex align-items-start gap-2 lh-sm');
    const boton = crearBotonDetalle(item, idDetalle);
    izquierda.appendChild(boton);

    const titulos = crearElemento('div', 'lh-sm');
    titulos.appendChild(crearElemento('h3', 'h6 mb-0', item.producto));
    const insignias = crearElemento('div', 'd-flex flex-wrap gap-1 mt-1');
    if (item.variedad) {
      insignias.appendChild(crearInsignia('text-bg-light border text-body-secondary', item.variedad));
    }
    if (item.unidad) {
      insignias.appendChild(crearInsignia('text-bg-secondary-subtle text-secondary-emphasis', item.unidad));
    }
    insignias.appendChild(crearInsignia('text-bg-primary-subtle text-primary-emphasis', 'rango ' + formatearPorcentaje(item.dispersión)));
    titulos.appendChild(insignias);
    izquierda.appendChild(titulos);
    cabecera.appendChild(izquierda);
    cabecera.appendChild(crearBotonGuardar(item));
    cuerpo.appendChild(cabecera);

    const estadisticos = crearElemento('div', 'row g-2 mb-2');
    estadisticos.appendChild(crearBloqueEstadistico('Mínimo', formatearMonto(item.minimo), 'text-success-emphasis'));
    estadisticos.appendChild(crearBloqueEstadistico('Promedio', formatearMonto(item.promedio)));
    estadisticos.appendChild(crearBloqueEstadistico('Máximo', formatearMonto(item.maximo), 'text-danger-emphasis'));
    cuerpo.appendChild(estadisticos);

    cuerpo.appendChild(crearBarraRango(item));

    const pie = crearElemento('div', 'd-flex flex-wrap justify-content-between gap-1 small text-body-secondary');
    pie.appendChild(crearElemento('span', '', item.cantidadMercados + (item.cantidadMercados === 1 ? ' mercado' : ' mercados')));
    pie.appendChild(crearElemento('span', 'text-truncate', 'mejor en ' + (item.mejorMercado || '—')));
    pie.appendChild(crearElemento('span', 'w-100', formatearFecha(item.fecha)));
    cuerpo.appendChild(pie);

    const contenido = crearElemento('div', 'mt-3' + (abierto ? '' : ' d-none'));
    contenido.id = idDetalle;
    if (abierto) {
      contenido.appendChild(crearDetalleMercados(item));
      contenido.dataset.construido = '1';
    }
    cuerpo.appendChild(contenido);

    boton.addEventListener('click', function () {
      alternarDetalle(item, boton, contenido, contenido);
    });

    tarjeta.appendChild(cuerpo);
    columna.appendChild(tarjeta);
    return columna;
  }

  function alternarGuardado(clave) {
    if (estado.guardados.has(clave)) {
      estado.guardados.delete(clave);
    } else {
      estado.guardados.add(clave);
    }
    estado.hayGuardados = estado.guardados.size > 0;
    escribirAlmacenamiento(CLAVE_GUARDADOS, Array.from(estado.guardados));
    actualizarContadorGuardados();

    const debeRefiltrar = estado.filtros.soloGuardados;
    if (debeRefiltrar) {
      refrescar();
      return;
    }

    const selector = '[data-clave="' + clave + '"]';
    const botones = document.querySelectorAll(selector);
    for (const boton of botones) {
      const activo = estado.guardados.has(clave);
      boton.setAttribute('aria-pressed', activo ? 'true' : 'false');
      boton.classList.toggle('favorito-activo', activo);
      boton.replaceChild(crearIcono(activo ? 'bookmark-fill' : 'bookmark'), boton.firstChild);
    }
  }

  function actualizarContadorGuardados() {
    nodos.contadorGuardados.textContent = formateadorNumero.format(estado.guardados.size);
    nodos.interruptorGuardados.disabled = estado.guardados.size === 0;
    if (estado.guardados.size === 0 && estado.filtros.soloGuardados) {
      estado.filtros.soloGuardados = false;
      nodos.interruptorGuardados.checked = false;
    }
  }

  function pintarResumen() {
    const resultados = estado.resultados;
    const mercados = new Set();
    let minimo = Infinity;
    let productoMasBajo = '';
    let amplitudMaxima = 0;
    let productoMasDisperso = '';

    for (const item of resultados) {
      item.nombresMercados.forEach(function (nombre) { mercados.add(nombre); });
      if (item.minimo < minimo) {
        minimo = item.minimo;
        productoMasBajo = item.producto + (item.variedad ? ' · ' + item.variedad : '');
      }
      if (item.amplitud > amplitudMaxima) {
        amplitudMaxima = item.amplitud;
        productoMasDisperso = item.producto + (item.variedad ? ' · ' + item.variedad : '');
      }
    }

    nodos.resumenProductos.textContent = formateadorNumero.format(resultados.length);
    nodos.resumenMercados.textContent = formateadorNumero.format(mercados.size);
    nodos.resumenPrecioBajo.textContent = Number.isFinite(minimo) ? formatearMonto(minimo) : '—';
    nodos.resumenPrecioBajoDetalle.textContent = productoMasBajo;
    nodos.resumenDispersion.textContent = amplitudMaxima > 0 ? formatearMonto(amplitudMaxima) : '—';
    nodos.resumenDispersionDetalle.textContent = productoMasDisperso;
  }

  function mostrarEstadoVacio(visible) {
    nodos.estadoVacio.classList.toggle('d-none', !visible);
    if (visible) {
      const hayBusqueda = estado.filtros.busqueda.trim().length > 0;
      const hayMercado = estado.filtros.mercado !== '';
      nodos.estadoVacioDetalle.textContent = hayBusqueda || hayMercado
        ? 'No encontramos productos que cumplan los filtros aplicados. Prueba con otro término o revisa el mercado seleccionado.'
        : 'El archivo de datos no contiene registros para mostrar.';
    }
  }

  function pintarProductos() {
    const generacion = ++estado.generacion;
    nodos.cuerpoTabla.replaceChildren();
    nodos.listaTarjetas.replaceChildren();

    const total = estado.resultados.length;
    nodos.contadorResultados.textContent = formateadorNumero.format(total);
    nodos.hintRenderizado.textContent = 'Actualizado con ' + new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

    if (total === 0) {
      mostrarEstadoVacio(true);
      nodos.zonaCarga.classList.add('d-none');
      return;
    }

    mostrarEstadoVacio(false);
    const pantallaAncha = consultaPantallaAncha.matches;
    let indice = 0;

    const siguienteLote = function () {
      if (generacion !== estado.generacion) {
        return;
      }

      const loteTabla = document.createDocumentFragment();
      const loteTarjetas = document.createDocumentFragment();
      const fin = Math.min(indice + TAMANO_LOTE, total);

      for (; indice < fin; indice += 1) {
        const item = estado.resultados[indice];
        if (pantallaAncha) {
          loteTabla.appendChild(crearFila(item, indice));
        } else {
          loteTarjetas.appendChild(crearTarjeta(item, indice));
        }
      }

      nodos.cuerpoTabla.appendChild(loteTabla);
      nodos.listaTarjetas.appendChild(loteTarjetas);

      if (indice < total) {
        nodos.zonaCarga.classList.remove('d-none');
        window.requestAnimationFrame(siguienteLote);
      } else {
        nodos.zonaCarga.classList.add('d-none');
      }
    };

    siguienteLote();
  }

  function guardarPreferencias() {
    escribirAlmacenamiento(CLAVE_PREFERENCIAS, {
      busqueda: estado.filtros.busqueda,
      mercado: estado.filtros.mercado,
      orden: estado.filtros.orden,
      soloGuardados: estado.filtros.soloGuardados
    });
  }

  function restaurarPreferencias() {
    const guardadas = leerAlmacenamiento(CLAVE_PREFERENCIAS, null);
    if (guardadas && typeof guardadas === 'object') {
      if (typeof guardadas.busqueda === 'string') {
        estado.filtros.busqueda = guardadas.busqueda;
      }
      if (typeof guardadas.mercado === 'string') {
        estado.filtros.mercado = guardadas.mercado;
      }
      if (typeof guardadas.orden === 'string') {
        estado.filtros.orden = guardadas.orden;
      }
      estado.filtros.soloGuardados = guardadas.soloGuardados === true;
    }

    const guardados = leerAlmacenamiento(CLAVE_GUARDADOS, []);
    if (Array.isArray(guardados)) {
      estado.guardados = new Set(guardados.filter(function (clave) { return typeof clave === 'string'; }));
    }
    estado.hayGuardados = estado.guardados.size > 0;
  }

  function pintarSelectorMercados() {
    const opciones = [crearElemento('option', '', 'Todos los mercados')];
    opciones[0].value = '';

    for (const mercado of estado.mercados) {
      const opcion = crearElemento('option', '', mercado);
      opcion.value = mercado;
      opciones.push(opcion);
    }

    nodos.selectorMercado.replaceChildren(...opciones);
    if (estado.filtros.mercado && estado.mercados.indexOf(estado.filtros.mercado) === -1) {
      estado.filtros.mercado = '';
    }
    nodos.selectorMercado.value = estado.filtros.mercado;
  }

  function sincronizarControles() {
    nodos.campoBusqueda.value = estado.filtros.busqueda;
    nodos.selectorMercado.value = estado.filtros.mercado;
    nodos.selectorOrden.value = estado.filtros.orden;
    nodos.interruptorGuardados.checked = estado.filtros.soloGuardados && estado.hayGuardados;
  }

  function refrescar() {
    guardarPreferencias();
    filtrarProductos();
    pintarResumen();
    pintarProductos();
    actualizarContadorGuardados();
  }

  function restablecerFiltros() {
    estado.filtros.busqueda = '';
    estado.filtros.mercado = '';
    estado.filtros.orden = 'promedio-asc';
    estado.filtros.soloGuardados = false;
    sincronizarControles();
    refrescar();
    nodos.campoBusqueda.focus();
  }

  function registrarEventos() {
    nodos.campoBusqueda.addEventListener('input', function () {
      window.clearTimeout(temporizadorBusqueda);
      temporizadorBusqueda = window.setTimeout(function () {
        estado.filtros.busqueda = nodos.campoBusqueda.value;
        refrescar();
      }, RETARDO_BUSQUEDA);
    });

    nodos.botonLimpiarBusqueda.addEventListener('click', function () {
      nodos.campoBusqueda.value = '';
      estado.filtros.busqueda = '';
      refrescar();
      nodos.campoBusqueda.focus();
    });

    nodos.selectorMercado.addEventListener('change', function () {
      estado.filtros.mercado = nodos.selectorMercado.value;
      refrescar();
    });

    nodos.selectorOrden.addEventListener('change', function () {
      estado.filtros.orden = nodos.selectorOrden.value;
      refrescar();
    });

    nodos.interruptorGuardados.addEventListener('change', function () {
      estado.filtros.soloGuardados = nodos.interruptorGuardados.checked;
      refrescar();
    });

    nodos.botonRestablecer.addEventListener('click', restablecerFiltros);
    nodos.botonRestablecerVacio.addEventListener('click', restablecerFiltros);

    document.addEventListener('keydown', function (evento) {
      if (evento.key === '/' && document.activeElement !== nodos.campoBusqueda) {
        evento.preventDefault();
        nodos.campoBusqueda.focus();
      }
    });

    if (typeof consultaPantallaAncha.addEventListener === 'function') {
      consultaPantallaAncha.addEventListener('change', function () {
        if (!estado.cargando) {
          pintarProductos();
        }
      });
    }
  }

  function recogerNodos() {
    const identificadores = [
      'contenidoApp', 'estadoCargaInicial', 'estadoError', 'estadoErrorDetalle', 'campoBusqueda',
      'botonLimpiarBusqueda', 'selectorMercado', 'selectorOrden', 'interruptorGuardados', 'contadorGuardados',
      'botonRestablecer', 'botonRestablecerVacio', 'contadorResultados', 'hintRenderizado', 'zonaCarga',
      'cuerpoTabla', 'listaTarjetas', 'estadoVacio', 'estadoVacioDetalle', 'resumenProductos', 'resumenMercados',
      'resumenPrecioBajo', 'resumenPrecioBajoDetalle', 'resumenDispersion', 'resumenDispersionDetalle'
    ];
    for (const id of identificadores) {
      nodos[id] = document.getElementById(id);
    }
  }

  function mostrarError(mensaje) {
    estado.cargando = false;
    nodos.estadoCargaInicial.classList.add('d-none');
    nodos.contenidoApp.classList.add('d-none');
    nodos.estadoErrorDetalle.textContent = mensaje;
    nodos.estadoError.classList.remove('d-none');
  }

  function extraerRegistros(carga) {
    if (Array.isArray(carga)) {
      return carga;
    }
    if (carga && typeof carga === 'object') {
      for (const clave of ['precios', 'datos', 'registros', 'items']) {
        if (Array.isArray(carga[clave])) {
          return carga[clave];
        }
      }
    }
    return [];
  }

  async function cargarDatos() {
    const respuesta = await window.fetch(RUTA_DATOS, { cache: 'no-store' });
    if (!respuesta.ok) {
      throw new Error('El archivo ' + RUTA_DATOS + ' respondió con el estado ' + respuesta.status + '.');
    }
    return respuesta.json();
  }

  async function iniciar() {
    recogerNodos();
    restaurarPreferencias();
    registrarEventos();
    actualizarContadorGuardados();

    try {
      const carga = await cargarDatos();
      const indice = construirIndice(extraerRegistros(carga));
      estado.productos = indice.productos;
      estado.mercados = indice.mercados;
      estado.cargando = false;
    } catch (error) {
      mostrarError('Detalle técnico: ' + (error && error.message ? error.message : 'error desconocido al leer el JSON.'));
      return;
    }

    pintarSelectorMercados();
    sincronizarControles();
    refrescar();
    nodos.estadoCargaInicial.classList.add('d-none');
    nodos.contenidoApp.classList.remove('d-none');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
