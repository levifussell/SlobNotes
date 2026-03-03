tags: alex evans, wookash
---

link: https://www.patreon.com/posts/hardware-from-150764565

NOTES:
- kicad.org for software to make pcb boards.
  - Alex uses Fabrication Toolkit plugin -- converts the entire file to zip for PCB printing.
- jlcpcb.com for parts.
- easyeda2kicad (github/uPesy) for translating between eda and kicad.
- [jlc part search](https://yaqwsx.github.io/jlcparts/#/)
- SWD is a 'god mode' that allows you to debug hardware setup rather than usb.
- minimize wires crossing on PCB (dipping below the board) as crossing signals create chatter and this slightly interferes with the signal. Alex made slow button wires cross USB because the button wires will rarely be sending a signal.
- I2C and SPI and I2S (autio) are standards for electrically talking to micro-electronics components.
- RPi has pio which is a custom program running on tiny ram with tiny (16?) instruction set that allows you to communicate with electronics generally (without relying on I2C, SPI, I2S, etc standards) -- it is a micro-cpu (2 registers).
