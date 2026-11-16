import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from './src/theme/colors';
import { HomeScreen } from './src/screens/HomeScreen';
import { ShopScreen } from './src/screens/ShopScreen';
import { CartScreen } from './src/screens/CartScreen';
import { AccountScreen } from './src/screens/AccountScreen';
import { ProductDetailModal } from './src/screens/ProductDetailModal';
import { SidebarDrawer } from './src/components/SidebarDrawer';
import { Product, CartAPI } from './src/services/api';

const Tab = createBottomTabNavigator();
export const navigationRef = createNavigationContainerRef();

export default function App() {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [cartCount, setCartCount] = useState<number>(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountInitialTab, setAccountInitialTab] = useState<'orders' | 'addresses' | 'profile' | 'settings'>('orders');

  // Initial cart count load
  const refreshCartCount = useCallback(async () => {
    try {
      const summary = await CartAPI.getSummary();
      setCartCount(summary.item_count || 0);
    } catch {
      // fallback
    }
  }, []);

  useEffect(() => {
    refreshCartCount();
  }, [refreshCartCount]);

  const handleOpenProduct = (product: Product) => {
    setSelectedProduct(product);
    setModalVisible(true);
  };

  const handleCloseProduct = () => {
    setModalVisible(false);
    setSelectedProduct(null);
  };

  const handleProductAddedToCart = (count: number) => {
    setCartCount(count);
  };

  const handleSidebarNavigate = (
    screen: 'Home' | 'Shop' | 'Cart' | 'Account',
    tab?: 'orders' | 'addresses' | 'profile' | 'settings'
  ) => {
    if (tab) {
      setAccountInitialTab(tab);
    }
    if (navigationRef.isReady()) {
      (navigationRef as any).navigate(screen);
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer ref={navigationRef}>
        <Tab.Navigator
          initialRouteName="Home"
          screenOptions={({ route }) => ({
            headerStyle: {
              backgroundColor: Colors.dark,
              elevation: 0,
              shadowOpacity: 0,
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(197, 160, 89, 0.25)',
            },
            headerTitleStyle: {
              fontFamily: 'Georgia',
              fontSize: 20,
              fontWeight: '700',
              color: Colors.accent,
              letterSpacing: 2,
            },
            headerTitleAlign: 'center',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => setSidebarOpen(true)}
                style={styles.hamburgerBtn}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="menu" size={26} color={Colors.accent} />
              </TouchableOpacity>
            ),
            headerRight: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigationRef.isReady()) {
                    (navigationRef as any).navigate('Cart');
                  }
                }}
                style={styles.headerRightBtn}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="bag-handle-outline" size={22} color={Colors.white} />
                {cartCount > 0 && (
                  <View style={styles.headerBagBadge}>
                    <Text style={styles.headerBagBadgeText}>{cartCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ),
            tabBarActiveTintColor: Colors.accent,
            tabBarInactiveTintColor: Colors.textMuted,
            tabBarStyle: {
              backgroundColor: Colors.white,
              borderTopColor: Colors.border,
              borderTopWidth: 1,
              height: Platform.OS === 'ios' ? 88 : 64,
              paddingBottom: Platform.OS === 'ios' ? 28 : 10,
              paddingTop: 8,
              elevation: 8,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.06,
              shadowRadius: 6,
            },
            tabBarLabelStyle: {
              fontSize: 11,
              fontWeight: '600',
              letterSpacing: 0.3,
            },
            tabBarIcon: ({ focused, color, size }) => {
              let iconName: keyof typeof Ionicons.glyphMap;

              if (route.name === 'Home') {
                iconName = focused ? 'home' : 'home-outline';
              } else if (route.name === 'Shop') {
                iconName = focused ? 'bag-handle' : 'bag-handle-outline';
              } else if (route.name === 'Cart') {
                iconName = focused ? 'cart' : 'cart-outline';
              } else {
                iconName = focused ? 'person' : 'person-outline';
              }

              return <Ionicons name={iconName} size={size || 22} color={color} />;
            },
          })}
        >
          <Tab.Screen
            name="Home"
            options={{
              title: 'LUXELANE',
            }}
          >
            {({ navigation }) => (
              <HomeScreen
                onNavigateShop={() => navigation.navigate('Shop')}
                onNavigateCart={() => navigation.navigate('Cart')}
                onNavigateAccount={() => navigation.navigate('Account')}
                onProductPress={handleOpenProduct}
              />
            )}
          </Tab.Screen>

          <Tab.Screen
            name="Shop"
            options={{
              title: 'COLLECTIONS',
            }}
          >
            {() => (
              <ShopScreen
                onProductPress={handleOpenProduct}
              />
            )}
          </Tab.Screen>

          <Tab.Screen
            name="Cart"
            options={{
              title: 'SHOPPING BAG',
              tabBarBadge: cartCount > 0 ? cartCount : undefined,
              tabBarBadgeStyle: {
                backgroundColor: Colors.accent,
                color: Colors.white,
                fontSize: 10,
                fontWeight: '700',
              },
            }}
          >
            {({ navigation }) => (
              <CartScreen
                onNavigateShop={() => navigation.navigate('Shop')}
                onNavigateAccount={() => navigation.navigate('Account')}
                onCartCountChange={(count) => setCartCount(count)}
              />
            )}
          </Tab.Screen>

          <Tab.Screen
            name="Account"
            options={{
              title: 'MY ACCOUNT',
            }}
          >
            {({ navigation }) => (
              <AccountScreen
                onNavigateShop={() => navigation.navigate('Shop')}
                initialTab={accountInitialTab}
              />
            )}
          </Tab.Screen>
        </Tab.Navigator>
      </NavigationContainer>

      {/* 3-Line Hamburger Sidebar Drawer */}
      <SidebarDrawer
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        cartCount={cartCount}
        onNavigate={handleSidebarNavigate}
      />

      {/* Product Detail Modal */}
      <ProductDetailModal
        visible={modalVisible}
        product={selectedProduct}
        onClose={handleCloseProduct}
        onAddedToCart={handleProductAddedToCart}
      />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  hamburgerBtn: {
    marginLeft: 16,
    padding: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRightBtn: {
    marginRight: 16,
    padding: 6,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBagBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: Colors.accent,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  headerBagBadgeText: {
    color: Colors.white,
    fontSize: 9,
    fontWeight: '800',
  },
});
