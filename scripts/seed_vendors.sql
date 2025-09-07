-- seed a basic admin and a couple of vendors
INSERT INTO users (id,name,email,phone,password_hash,role) VALUES (gen_random_uuid(),'Admin','admin@example.com','+234000000000','', 'admin');
INSERT INTO users (id,name,email,phone,password_hash,role) VALUES (gen_random_uuid(),'Mama Chichi','mama@example.com','+234800000001','', 'vendor');

INSERT INTO vendors (name,address,lat,lng,food_item,price_min,phone,email,status) VALUES ('Mama Chichi','Badagry, Lagos',6.4333,3.3167,'Jollof rice',1000,'+234800000001','mama@example.com','verified');
INSERT INTO vendors (name,address,lat,lng,food_item,price_min,phone,email,status) VALUES ('Baba Suya','Lekki, Lagos',6.435,3.452,'Suya',800,'+234800000002','baba@example.com','unverified');
