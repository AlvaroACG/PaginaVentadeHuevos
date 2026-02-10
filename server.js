import express from "express";
import mysql from "mysql2";

const app = express();
app.use(express.urlencoded({ extended: true }));

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

app.post("/pedido", (req, res) => {
  const { nombre, rut, docenas, bandejas } = req.body;

  const d = parseInt(docenas || 0);
  const b = parseInt(bandejas || 0);

  if (d === 0 && b === 0) {
    return res.send("Pedido inválido");
  }

  const total = (d * 2400) + (b * 6000);

  db.query(
    "INSERT INTO pedidos (nombre, rut, docenas, bandejas, total) VALUES (?,?,?,?,?)",
    [nombre, rut, d, b, total],
    (err, result) => {
      if (err) return res.send("Error al guardar pedido");

      res.send(`
        Pedido registrado correctamente<br><br>
        <strong>ID del pedido:</strong> ${result.insertId}<br>
        <strong>ID del cliente:</strong> ${rut}<br>
        <strong>Total a pagar:</strong> $${total}<br><br>
        Presenta tu ID al retirar y pagar.
      `);
    }
  );
});

app.listen(3000, () => {
  console.log("Servidor activo");
});
