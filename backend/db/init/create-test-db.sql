-- Solo en el contenedor local (docker-compose.yml): base de datos separada para los tests,
-- que vacían las tablas. Se ejecuta una vez, al crear el volumen.
CREATE DATABASE portfolio_test OWNER portfolio;
