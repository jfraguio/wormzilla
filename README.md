# WORMZILLA

**Devora. Crece. Domina.** Un juego web de serpientes en solitario, con estética de arena orbital, música electrónica generativa, 17 pieles y magia comprable con puntos.

[▶ Jugar online](https://fraguio.com/wormzilla/)

![WORMZILLA en tablet](assets/preview.jpg)

## Cómo jugar

- **Tablet**: apoya un dedo en la pantalla y arrástralo para girar. Al soltar, la serpiente conserva el rumbo. Sin turbo táctil. Las habilidades activas se lanzan con el **botón PODER** que aparece sobre el minimapa.
- **Ratón**: mueve el cursor para girar. Mantén pulsado para turbo. Pulsa **E** para usar el poder activo.
- **Teclado**: flechas o WASD para girar; espacio para turbo; E para poder; Esc para pausa; M para silenciar.

Come orbes para crecer. Si tu cabeza toca el cuerpo de otra serpiente, mueres y sueltas tu masa como botín. Cabeza contra cabeza: ambos caéis. El borde de la arena es letal. Los orbes dorados valen más.

Entre la comida aparecen **premios**: inmunidad temporal, magnetismo, furia y rayos que fríen a la serpiente más cercana. Cada 30 segundos de partida recibes bonus, botín y, a veces, un premio extra: aguantar paga.

Cada cierto tiempo el juego lanza una **cuenta atrás de amenaza**. Cuando termina, aparece un monstruo que te persigue: el objetivo cambia a **escapar** hasta que se marche. Si sobrevives, te llevas un botín extra y puntos de bonus. El monstruo también devora serpientes rivales.

## Pieles

17 tipos de serpiente, cada uno con paleta, patrón, ojos y detalles propios. Cuatro son gratis y el resto se desbloquean con puntos: Neón, Víbora, Ascua, Glitch, Veneno, Nebula, Cromo, Arcoíris, Espectro, Wormzilla, Solaris, Caramelo, Sakura, Zafiro, Ónix, Aurora y Mecha.

## Poderes y efectos

Se compran con puntos y se guardan en el perfil. Puedes equipar **un poder** y **un efecto mágico** a la vez.

- **Nova**: onda expansiva que destruye a las serpientes cercanas y convierte sus cuerpos en botín. También aturde al monstruo.
- **Micro**: cuerpo microscópico y velocidad extrema durante unos segundos.
- **Titán**: engrosa tu cuerpo para que los rivales se estrellen contra ti.
- **Fantasma**: atraviesa cuerpos y serpientes sin morir durante unos segundos.
- **Magneto**: atrae orbes desde mucho más lejos. Pasivo.

Las **estelas** ya no son solo decorativas: cada efecto desata una habilidad automática con recarga. Chispas aturde con un destello, Piro quema y roba masa, Neón lanza una descarga, Prisma da un instante de velocidad e inmunidad, Vacío absorbe orbes y frena rivales, y Órbita castiga a quien se acerque. Las serpientes IA también equipan y usan estelas.

- **Efectos**: Chispas, Piro, Neón Eléctrico, Prisma, Vacío y Órbita; estelas, auras y habilidades limitadas que envuelven tu serpiente.

![Poderes y efectos de WORMZILLA](assets/preview-powers.jpg)

## Progreso

Los puntos, las pieles, los poderes y efectos desbloqueados, las selecciones equipadas, el récord, las partidas y las bajas se guardan en `localStorage` del navegador.

## Desarrollo local

No requiere build ni dependencias:

```bash
python3 -m http.server 8000
```

Abre `http://localhost:8000`.

## Tecnología

- Canvas 2D con capa de bloom, partículas, estelas mágicas, cámara suave y efectos de luz.
- Calidad adaptativa: detecta equipos lentos y ajusta resolución, bloom, partículas, rejilla y detalles de render para mantener el ritmo.
- Rejilla espacial de comida y reutilización de rutas/partículas para reducir asignaciones y tirones.
- Audio 100 % procedural con WebAudio: música deep house generativa y efectos sintetizados.
- IA de serpientes con búsqueda de comida, evasión de cuerpos, caza oportunista, respawn y estelas con habilidades.
- Eventos de amenaza con cuenta atrás, monstruo perseguidor y recompensa por escapar.
- Render adaptado a escritorio, tablet y orientación vertical.
- Manifest + iconos para instalar como web app.

## Créditos

- Diseño y desarrollo: [jfraguio](https://github.com/jfraguio).
- Tipografías: Orbitron y Rajdhani, bajo SIL Open Font License 1.1. Licencias en `assets/fonts/`.
