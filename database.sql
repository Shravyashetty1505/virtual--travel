-- Complete Database Schema for TravelSphere
-- Run this in your MySQL database

-- Create database
CREATE DATABASE IF NOT EXISTS travel_db;
USE travel_db;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  dob DATE,
  is_student BOOLEAN DEFAULT FALSE,
  is_admin BOOLEAN DEFAULT FALSE,
  phone VARCHAR(20),
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email)
);

-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  booking_type ENUM('flight', 'hotel', 'train', 'car') NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  details JSON,
  travel_date DATE,
  status ENUM('pending', 'confirmed', 'cancelled', 'completed') DEFAULT 'confirmed',
  payment_method VARCHAR(50),
  transaction_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_booking_type (booking_type)
);

-- Reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  booking_id INT NOT NULL,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  INDEX idx_booking_id (booking_id),
  INDEX idx_rating (rating)
);

-- Favorites/Wishlist table
CREATE TABLE IF NOT EXISTS favorites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  item_type ENUM('flight', 'hotel', 'train', 'car', 'destination') NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  item_details JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_favorite (user_id, item_type, item_name),
  INDEX idx_user_id (user_id)
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('booking', 'promotion', 'alert', 'reminder') DEFAULT 'booking',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_is_read (is_read)
);

-- Support tickets table
CREATE TABLE IF NOT EXISTS support_tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  subject VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('open', 'in_progress', 'resolved', 'closed') DEFAULT 'open',
  priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_status (status)
);

-- Promo codes table
CREATE TABLE IF NOT EXISTS promo_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  discount_type ENUM('percentage', 'fixed') NOT NULL,
  discount_value DECIMAL(10, 2) NOT NULL,
  min_booking_amount DECIMAL(10, 2) DEFAULT 0,
  max_uses INT DEFAULT NULL,
  current_uses INT DEFAULT 0,
  valid_from DATE NOT NULL,
  valid_until DATE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_code (code),
  INDEX idx_is_active (is_active)
);

-- Insert sample admin user (password: admin123)
INSERT INTO users (name, email, password, is_admin, is_student) 
VALUES ('Admin User', 'admin@travelsphere.com', '$2a$10$XQWvzxKJQxZ8FyRl5p1bXOgP5K7EHYpYk6qYvFqPQBzHBLwZYfUC6', TRUE, FALSE)
ON DUPLICATE KEY UPDATE email=email;

-- Insert sample student user (password: student123)
INSERT INTO users (name, email, password, is_admin, is_student) 
VALUES ('Student User', 'student@travelsphere.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', FALSE, TRUE)
ON DUPLICATE KEY UPDATE email=email;

-- Insert sample promo codes
INSERT INTO promo_codes (code, discount_type, discount_value, min_booking_amount, max_uses, valid_from, valid_until) 
VALUES 
  ('WELCOME10', 'percentage', 10.00, 1000, 100, '2025-01-01', '2025-12-31'),
  ('FLAT500', 'fixed', 500.00, 2000, 50, '2025-01-01', '2025-06-30'),
  ('STUDENT15', 'percentage', 15.00, 500, NULL, '2025-01-01', '2025-12-31')
ON DUPLICATE KEY UPDATE code=code;

-- Create views for analytics
CREATE OR REPLACE VIEW booking_analytics AS
SELECT 
  DATE(created_at) as booking_date,
  booking_type,
  COUNT(*) as total_bookings,
  SUM(price) as total_revenue,
  AVG(price) as avg_booking_value
FROM bookings
WHERE status = 'confirmed'
GROUP BY DATE(created_at), booking_type;

CREATE OR REPLACE VIEW user_stats AS
SELECT 
  u.id,
  u.name,
  u.email,
  COUNT(b.id) as total_bookings,
  SUM(b.price) as total_spent,
  AVG(r.rating) as avg_rating_given
FROM users u
LEFT JOIN bookings b ON u.id = b.user_id
LEFT JOIN reviews r ON u.id = r.user_id
GROUP BY u.id;

-- Stored procedure for applying discounts
DELIMITER //
CREATE PROCEDURE apply_discount(
  IN booking_price DECIMAL(10,2),
  IN promo_code VARCHAR(50),
  IN is_student BOOLEAN,
  OUT final_price DECIMAL(10,2),
  OUT discount_applied DECIMAL(10,2)
)
BEGIN
  DECLARE promo_discount DECIMAL(10,2) DEFAULT 0;
  DECLARE student_discount DECIMAL(10,2) DEFAULT 0;
  DECLARE promo_type VARCHAR(20);
  DECLARE promo_value DECIMAL(10,2);
  
  -- Apply student discount (10%)
  IF is_student THEN
    SET student_discount = booking_price * 0.10;
  END IF;
  
  -- Apply promo code if valid
  IF promo_code IS NOT NULL AND promo_code != '' THEN
    SELECT discount_type, discount_value INTO promo_type, promo_value
    FROM promo_codes
    WHERE code = promo_code 
      AND is_active = TRUE
      AND CURDATE() BETWEEN valid_from AND valid_until
      AND (max_uses IS NULL OR current_uses < max_uses)
    LIMIT 1;
    
    IF promo_type = 'percentage' THEN
      SET promo_discount = (booking_price - student_discount) * (promo_value / 100);
    ELSEIF promo_type = 'fixed' THEN
      SET promo_discount = promo_value;
    END IF;
  END IF;
  
  SET discount_applied = student_discount + promo_discount;
  SET final_price = GREATEST(booking_price - discount_applied, 0);
END //
DELIMITER ;

-- Sample data for testing (optional)
-- Uncomment to insert sample bookings

/*
INSERT INTO bookings (user_id, booking_type, item_name, price, details, travel_date, status) VALUES
(1, 'flight', 'IndiGo - Delhi to Mumbai', 2500, '{"from":"Delhi","to":"Mumbai","time":"06:00"}', '2025-11-15', 'confirmed'),
(1, 'hotel', 'Taj Resort', 7000, '{"city":"Goa","nights":2}', '2025-11-20', 'confirmed'),
(2, 'train', 'Rajdhani Express', 1800, '{"route":"Delhi - Mumbai"}', '2025-11-10', 'confirmed');

INSERT INTO reviews (user_id, booking_id, rating, comment) VALUES
(1, 1, 5, 'Excellent flight experience!'),
(1, 2, 4, 'Great hotel, loved the amenities'),
(2, 3, 5, 'Very comfortable journey');
*/