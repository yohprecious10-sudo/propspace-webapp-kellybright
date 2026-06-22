import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createServer as createViteServer } from 'vite';
import { readDb, writeDb } from './server/db';
import { Property, PropertyType, ListingStatus, User, SUPPORTED_COUNTRIES } from './src/types';

const app = express();
const PORT = 3000;

// Use a random JWT secret fallback if not defined in environment
const JWT_SECRET = process.env.JWT_SECRET || 'propspace_fallback_jwt_secret_key_123!';

// Set size limit high enough to support Base64 images
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

// --- Authentication Middleware ---
interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
}

function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access token is required. Please login.' });
    return;
  }

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) {
      res.status(403).json({ error: 'Invalid or expired token. Please login again.' });
      return;
    }
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    next();
  });
}

// --- API Roots & Endpoints ---

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 2. Auth: Register
app.post('/api/auth/register', (req, res) => {
  try {
    const { email, username, password, name, phone } = req.body;

    if (!email || !username || !password || !name) {
      res.status(400).json({ error: 'Email, username, password, and name are required.' });
      return;
    }

    const db = readDb();
    
    // Check key uniqueness
    const emailExists = db.users.some(u => u.email.toLowerCase() === email.toLowerCase());
    const usernameExists = db.users.some(u => u.username.toLowerCase() === username.toLowerCase());

    if (emailExists) {
      res.status(400).json({ error: 'Email is already registered.' });
      return;
    }
    if (usernameExists) {
      res.status(400).json({ error: 'Username is already taken.' });
      return;
    }

    // Salt and Hash Password
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    const newUser: User = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      email: email.toLowerCase(),
      username: username.toLowerCase(),
      name,
      phone: phone || '',
      avatarUrl: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(username)}`,
      createdAt: new Date().toISOString()
    };

    db.users.push(newUser);
    db.passwords[newUser.id] = passwordHash;

    writeDb(db);

    // Create JWT token
    const token = jwt.sign({ userId: newUser.id, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: 'Registration successful!',
      token,
      user: newUser
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error during registration.' });
  }
});

// 3. Auth: Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;

    if (!emailOrUsername || !password) {
      res.status(400).json({ error: 'Email/username and password are required.' });
      return;
    }

    const db = readDb();
    const cleanLowerInput = emailOrUsername.toLowerCase();
    
    // Find user by email or username
    const user = db.users.find(u => 
      u.email.toLowerCase() === cleanLowerInput || 
      u.username.toLowerCase() === cleanLowerInput
    );

    if (!user) {
      res.status(401).json({ error: 'Invalid email/username or password.' });
      return;
    }

    const passwordHash = db.passwords[user.id];
    if (!passwordHash || !bcrypt.compareSync(password, passwordHash)) {
      res.status(401).json({ error: 'Invalid email/username or password.' });
      return;
    }

    // Create JWT token
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      message: 'Login successful!',
      token,
      user
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error during login.' });
  }
});

// 4. Get Current User Profile
app.get('/api/auth/me', authenticateToken, (req: AuthenticatedRequest, res) => {
  try {
    const db = readDb();
    const user = db.users.find(u => u.id === req.userId);

    if (!user) {
      res.status(404).json({ error: 'User profile not found.' });
      return;
    }

    res.json({ user });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error fetching user profile.' });
  }
});

// 5. Update Profile
app.put('/api/auth/profile', authenticateToken, (req: AuthenticatedRequest, res) => {
  try {
    const { name, phone, avatarUrl } = req.body;

    if (!name) {
      res.status(400).json({ error: 'DisplayName (name) is required.' });
      return;
    }

    const db = readDb();
    const userIdx = db.users.findIndex(u => u.id === req.userId);

    if (userIdx === -1) {
      res.status(404).json({ error: 'User profile not found.' });
      return;
    }

    // Update user profile keys
    const oldUser = db.users[userIdx];
    const updatedUser: User = {
      ...oldUser,
      name,
      phone: phone || '',
      avatarUrl: avatarUrl || oldUser.avatarUrl
    };

    db.users[userIdx] = updatedUser;

    // Update listings owner details for consistency
    db.properties = db.properties.map(p => {
      if (p.ownerId === req.userId) {
        return {
          ...p,
          ownerName: name,
          ownerPhone: phone || '',
          ownerAvatar: avatarUrl || oldUser.avatarUrl
        };
      }
      return p;
    });

    writeDb(db);

    res.json({
      message: 'Profile updated successfully!',
      user: updatedUser
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error updating profile.' });
  }
});

// 6. Security: Update Password after verification
app.put('/api/auth/password', authenticateToken, (req: AuthenticatedRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required.' });
      return;
    }

    const db = readDb();
    const passwordHash = db.passwords[req.userId!];

    if (!passwordHash || !bcrypt.compareSync(currentPassword, passwordHash)) {
      res.status(400).json({ error: 'Incorrect current password verification failed.' });
      return;
    }

    // Salt and hash new password
    const salt = bcrypt.genSaltSync(10);
    db.passwords[req.userId!] = bcrypt.hashSync(newPassword, salt);

    writeDb(db);

    res.json({ message: 'Password updated successfully!' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error security updating password.' });
  }
});

// 7. GET: Public Properties Feed with Filter / Search
app.get('/api/properties', (req, res) => {
  try {
    const { search, city, country, propertyType, minPrice, maxPrice } = req.query;
    const db = readDb();

    let list = db.properties;

    // Search filter (title, description, city, country)
    if (search) {
      const q = String(search).toLowerCase();
      list = list.filter(p => 
        p.title.toLowerCase().includes(q) || 
        p.description.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.country.toLowerCase().includes(q)
      );
    }

    // City filter
    if (city) {
      list = list.filter(p => p.city.toLowerCase() === String(city).toLowerCase());
    }

    // Country filter
    if (country) {
      list = list.filter(p => p.country.toLowerCase() === String(country).toLowerCase());
    }

    // Property Type filter
    if (propertyType) {
      list = list.filter(p => p.propertyType.toLowerCase() === String(propertyType).toLowerCase());
    }

    // Price filters
    if (minPrice) {
      list = list.filter(p => p.price >= Number(minPrice));
    }
    if (maxPrice) {
      list = list.filter(p => p.price <= Number(maxPrice));
    }

    // Sort by newest first
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ properties: list });
  } catch (error: any) {
    res.status(500).json({ error: 'Server error retrieving properties.' });
  }
});

// 8. GET: Private "My Listings" Feed for Authenticated Users
app.get('/api/properties/my', authenticateToken, (req: AuthenticatedRequest, res) => {
  try {
    const db = readDb();
    const myProperties = db.properties.filter(p => p.ownerId === req.userId);
    
    // Sort by newest first
    myProperties.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ properties: myProperties });
  } catch (error: any) {
    res.status(500).json({ error: 'Server error retrieving your properties.' });
  }
});

// 9. POST: Create Property Listing
app.post('/api/properties', authenticateToken, (req: AuthenticatedRequest, res) => {
  try {
    const { title, description, price, city, country, propertyType, imageUrls, status } = req.body;

    if (!title || !description || !price || !city || !country || !propertyType) {
      res.status(400).json({ error: 'Title, description, price, city, country, and property type are required.' });
      return;
    }

    const priceNum = Number(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      res.status(400).json({ error: 'Price must be a valid positive number.' });
      return;
    }

    const db = readDb();
    const user = db.users.find(u => u.id === req.userId);
    if (!user) {
      res.status(404).json({ error: 'Owner user not found.' });
      return;
    }

    // Look up currency for this country
    const countryConfig = SUPPORTED_COUNTRIES.find(c => c.name.toLowerCase() === country.toLowerCase()) || 
                          { name: country, code: 'OTHER', currencySymbol: '$', currencyCode: 'USD' };

    // Standardize images array: filter out empty inputs, make sure at least one default
    let finalImages: string[] = Array.isArray(imageUrls) ? imageUrls.filter(url => url && url.trim() !== '') : [];
    if (finalImages.length === 0) {
      // Fallback default image depending on type
      finalImages = ['https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&auto=format&fit=crop&q=80'];
    }

    const newProperty: Property = {
      id: `prop_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      title,
      description,
      price: priceNum,
      city,
      country,
      propertyType: propertyType as PropertyType,
      imageUrls: finalImages,
      ownerId: user.id,
      ownerName: user.name,
      ownerPhone: user.phone,
      ownerAvatar: user.avatarUrl,
      createdAt: new Date().toISOString(),
      status: (status as ListingStatus) || 'Available',
      currencySymbol: countryConfig.currencySymbol,
      currencyCode: countryConfig.currencyCode,
    };

    db.properties.push(newProperty);
    writeDb(db);

    res.status(201).json({
      message: 'Property listed successfully!',
      property: newProperty
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error creating listing.' });
  }
});

// 10. PUT: Edit Property (must be owner!)
app.put('/api/properties/:id', authenticateToken, (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { title, description, price, city, country, propertyType, imageUrls, status } = req.body;

    const db = readDb();
    const propIdx = db.properties.findIndex(p => p.id === id);

    if (propIdx === -1) {
      res.status(404).json({ error: 'Property listing not found.' });
      return;
    }

    const property = db.properties[propIdx];

    // Security Gate: Verify Ownership
    if (property.ownerId !== req.userId) {
      res.status(403).json({ error: 'Access denied: You are not authorized to modify this listing.' });
      return;
    }

    const priceNum = price !== undefined ? Number(price) : property.price;
    if (price !== undefined && (isNaN(priceNum) || priceNum <= 0)) {
      res.status(400).json({ error: 'Price must be a valid positive number.' });
      return;
    }

    let countryConfig = property.currencySymbol ? { currencySymbol: property.currencySymbol, currencyCode: property.currencyCode } : null;
    if (country && country.toLowerCase() !== property.country.toLowerCase()) {
      const found = SUPPORTED_COUNTRIES.find(c => c.name.toLowerCase() === country.toLowerCase());
      countryConfig = found ? { currencySymbol: found.currencySymbol, currencyCode: found.currencyCode } : { currencySymbol: '$', currencyCode: 'USD' };
    }

    let finalImages = property.imageUrls;
    if (imageUrls !== undefined) {
      finalImages = Array.isArray(imageUrls) ? imageUrls.filter((url: string) => url && url.trim() !== '') : [];
      if (finalImages.length === 0) {
        finalImages = property.imageUrls;
      }
    }

    const updatedProperty: Property = {
      ...property,
      title: title || property.title,
      description: description || property.description,
      price: priceNum,
      city: city || property.city,
      country: country || property.country,
      propertyType: (propertyType as PropertyType) || property.propertyType,
      imageUrls: finalImages,
      status: (status as ListingStatus) || property.status,
      currencySymbol: countryConfig ? countryConfig.currencySymbol : property.currencySymbol,
      currencyCode: countryConfig ? countryConfig.currencyCode : property.currencyCode,
    };

    db.properties[propIdx] = updatedProperty;
    writeDb(db);

    res.json({
      message: 'Property updated successfully!',
      property: updatedProperty
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error updating property listing.' });
  }
});

// 11. DELETE: Delete Property (must be owner!)
app.delete('/api/properties/:id', authenticateToken, (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const db = readDb();

    const prop = db.properties.find(p => p.id === id);

    if (!prop) {
      res.status(404).json({ error: 'Property listing not found.' });
      return;
    }

    // Security Gate: Verify Ownership
    if (prop.ownerId !== req.userId) {
      res.status(403).json({ error: 'Access denied: You are not authorized to delete this listing.' });
      return;
    }

    db.properties = db.properties.filter(p => p.id !== id);
    writeDb(db);

    res.json({ message: 'Property listing permanently deleted.' });
  } catch (error: any) {
    res.status(500).json({ error: 'Server error deleting listing.' });
  }
});

// --- Vite Middleware Server Setup ---

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production client serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PropSpace full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
