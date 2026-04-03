/**
 * CertChain — React Native Mobile App
 * Cross-platform iOS & Android
 * Google Auth → Wallet Link → Certificate Verification
 *
 * Stack: React Native + Expo + WalletConnect + Web3 + Google Sign-In
 */

// ─── App.tsx ──────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StyleSheet, Animated, Dimensions, StatusBar, Alert,
  ActivityIndicator, Modal, Image, Platform,
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// ── Auth & Web3 ───────────────────────────────────────────────────────────────
// import { GoogleSignin } from '@react-native-google-signin/google-signin';
// import WalletConnectProvider from '@walletconnect/react-native-dapp';
// import { useWalletConnect } from '@walletconnect/react-native-dapp';
// import { ethers } from 'ethers';

const { width: W, height: H } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// THEME  (matches the dark purple UI from design images)
// ─────────────────────────────────────────────────────────────────────────────

const T = {
  bg:        '#0a0a0f',
  bg2:       '#111118',
  bg3:       '#1a1a24',
  card:      '#14141e',
  card2:     '#1e1e2e',
  purple:    '#7B5EFF',
  purpleL:   '#9B7FFF',
  purpleD:   'rgba(123,94,255,0.15)',
  cyan:      '#00D4FF',
  green:     '#4ADE80',
  red:       '#FF4D6A',
  orange:    '#FF8C42',
  text:      '#E8E8F0',
  text2:     '#9090A8',
  text3:     '#5A5A72',
  border:    'rgba(255,255,255,0.06)',
  border2:   'rgba(123,94,255,0.25)',
  mono:      Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  display:   Platform.OS === 'ios' ? 'Georgia' : 'serif',
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

const Card = ({ children, style }: any) => (
  <View style={[styles.card, style]}>{children}</View>
);

const Badge = ({ label, color }: { label: string; color: string }) => (
  <View style={[styles.badge, { backgroundColor: color + '22', borderColor: color + '44' }]}>
    <Text style={[styles.badgeText, { color }]}>{label}</Text>
  </View>
);

const Btn = ({ label, onPress, variant = 'primary', loading = false, icon }: any) => {
  const bg = variant === 'primary' ? T.purple : variant === 'outline' ? 'transparent' : T.bg3;
  const tc = variant === 'primary' ? '#fff' : T.purpleL;
  const border = variant === 'outline' ? T.border2 : 'transparent';
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.btn, { backgroundColor: bg, borderColor: border, borderWidth: variant === 'outline' ? 1 : 0 }]}
    >
      {loading
        ? <ActivityIndicator color={tc} />
        : <Text style={[styles.btnText, { color: tc }]}>{icon ? `${icon}  ` : ''}{label}</Text>}
    </TouchableOpacity>
  );
};

const MonoText = ({ children, style }: any) => (
  <Text style={[{ fontFamily: T.mono, color: T.text3, fontSize: 11 }, style]}>{children}</Text>
);

const SectionLabel = ({ children }: any) => (
  <Text style={styles.sectionLabel}>{'// '}{children}</Text>
);

// ─────────────────────────────────────────────────────────────────────────────
// DOT MATRIX COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const DotMatrix = ({ rows = 5, cols = 10, density = 0.5 }) => {
  const dots = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({
      key: `${r}-${c}`,
      active: Math.random() < density,
      color: ['#7B5EFF', '#00D4FF', '#4ADE80', '#FF6BB5'][Math.floor(Math.random() * 4)],
    }))
  );
  return (
    <View>
      {dots.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: 3, marginBottom: 3 }}>
          {row.map(d => (
            <View
              key={d.key}
              style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: d.active ? d.color : T.bg3 }}
            />
          ))}
        </View>
      ))}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// API CLIENT
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = 'http://localhost:8000';

const api = {
  verify: async (hash: string) => {
    const res = await fetch(`${API_BASE}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cert_hash: hash }),
    });
    return res.json();
  },
  stats: async () => {
    const res = await fetch(`${API_BASE}/stats`);
    return res.json();
  },
  issue: async (data: any) => {
    const res = await fetch(`${API_BASE}/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SCREENS
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. ONBOARDING / AUTH ─────────────────────────────────────────────────────

export function AuthScreen({ onAuth }: { onAuth: () => void }) {
  const [step, setStep] = useState<'welcome' | 'wallet'>('welcome');
  const [loading, setLoading] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
  }, []);

  const handleGoogle = async () => {
    setLoading(true);
    // In prod: GoogleSignin.signIn() → post id_token to /auth/google
    await new Promise(r => setTimeout(r, 1500));
    setLoading(false);
    setStep('wallet');
  };

  const handleWallet = async () => {
    setLoading(true);
    // In prod: WalletConnect connector.connect() or MetaMask deep link
    await new Promise(r => setTimeout(r, 1200));
    setLoading(false);
    onAuth();
  };

  return (
    <View style={styles.authContainer}>
      <StatusBar barStyle="light-content" />
      {/* Ambient glow */}
      <View style={styles.ambientGlow} />

      <Animated.View style={{ opacity: fadeAnim, flex: 1, justifyContent: 'center', padding: 28 }}>
        {/* Logo */}
        <View style={styles.logoWrap}>
          <View style={styles.logoIcon}>
            <Text style={{ fontSize: 32 }}>⬡</Text>
          </View>
          <Text style={styles.logoText}>CertChain</Text>
          <Text style={styles.logoSub}>Blockchain Certificate Verification</Text>
        </View>

        {step === 'welcome' ? (
          <View>
            <Text style={styles.authTitle}>
              {step === 'welcome' ? 'Welcome Back' : 'Link Your Wallet'}
            </Text>
            <Text style={styles.authSub}>
              Sign in with Google, then link your crypto wallet to issue and verify certificates on-chain.
            </Text>
            <Btn label="Continue with Google" onPress={handleGoogle} loading={loading} icon="🔑" />
            <View style={styles.divider}><Text style={styles.dividerText}>Secure · Trustless · Decentralized</Text></View>
            <MonoText style={{ textAlign: 'center' }}>
              Powered by Polygon · Multi-Sig Enabled
            </MonoText>
          </View>
        ) : (
          <View>
            <Text style={styles.authTitle}>Link Your Wallet</Text>
            <Text style={styles.authSub}>
              Connect your Ethereum wallet to participate in multi-signature certificate issuance.
            </Text>
            <View style={styles.walletOptions}>
              {['MetaMask', 'WalletConnect', 'Coinbase Wallet'].map(w => (
                <TouchableOpacity key={w} style={styles.walletOption} onPress={handleWallet} activeOpacity={0.8}>
                  <Text style={styles.walletOptionText}>🔗  {w}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Btn label="Skip for Now" onPress={onAuth} variant="ghost" />
          </View>
        )}
      </Animated.View>
    </View>
  );
}

// ── 2. HOME / DASHBOARD ───────────────────────────────────────────────────────

export function HomeScreen() {
  const [stats, setStats] = useState({ total_certificates: 153320, avg_verify_ms: 28 });
  const [certs] = useState([
    { emoji: '🎓', name: 'Alex Johnson', course: 'BSc CS · MIT', status: 'valid', hash: '0x3a7b...2c1d' },
    { emoji: '📜', name: 'Maria Santos', course: 'Blockchain Dev · Coursera', status: 'valid', hash: '0xB9D1...4e8f' },
    { emoji: '🏆', name: 'James Liu', course: 'MSc Data · Stanford', status: 'valid', hash: '0xC4E8...7a3b' },
    { emoji: '📋', name: 'Priya Sharma', course: 'AWS · Amazon', status: 'revoked', hash: '0xF7D2...9c1e' },
  ]);

  return (
    <ScrollView style={styles.screen} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.screenHeader}>
        <View>
          <Text style={styles.greeting}>Hey, Steve! 👋</Text>
          <MonoText>Good morning</MonoText>
        </View>
        <View style={styles.walletChip}>
          <View style={styles.walletDot} />
          <MonoText style={{ color: T.text2 }}>0x7B3F...2a1c</MonoText>
        </View>
      </View>

      {/* Stats Row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
        <View style={styles.statsRow}>
          {[
            { val: stats.total_certificates.toLocaleString(), label: 'Certs Issued' },
            { val: '99.97%', label: 'Accuracy' },
            { val: `${stats.avg_verify_ms}ms`, label: 'Verify Speed' },
            { val: '0', label: 'Frauds' },
          ].map((s, i) => (
            <Card key={i} style={styles.statCard}>
              <Text style={styles.statVal}>{s.val}</Text>
              <MonoText>{s.label}</MonoText>
            </Card>
          ))}
        </View>
      </ScrollView>

      {/* Uptime Widget */}
      <Card style={{ marginHorizontal: 16, marginBottom: 16 }}>
        <View style={styles.rowBetween}>
          <SectionLabel>System Uptime</SectionLabel>
          <Badge label="● Live" color={T.green} />
        </View>
        <UptimeTimer />
        <View style={{ marginTop: 12 }}>
          <DotMatrix rows={2} cols={16} density={0.7} />
        </View>
      </Card>

      {/* Security Widget */}
      <Card style={{ marginHorizontal: 16, marginBottom: 16 }}>
        <View style={styles.rowBetween}>
          <SectionLabel>Security</SectionLabel>
          <Text style={{ fontSize: 18 }}>🛡️</Text>
        </View>
        <MonoText style={{ marginBottom: 4 }}>Threats Blocked</MonoText>
        <Text style={[styles.bigNumber, { color: T.text }]}>153 320</Text>
        <View style={styles.alertBox}>
          <Text style={{ color: T.red, fontSize: 12 }}>⚠️  2 Pending Multi-Sig Approvals</Text>
        </View>
      </Card>

      {/* Multi-Sig Status */}
      <Card style={{ marginHorizontal: 16, marginBottom: 16 }}>
        <View style={styles.rowBetween}>
          <SectionLabel>Multi-Sig Status</SectionLabel>
          <Badge label="2/3 Required" color={T.orange} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {[
            { addr: '0x7B3F...2a1c', signed: true },
            { addr: '0xA9D1...8e4b', signed: true },
            { addr: '0xC4E8...1f7d', signed: false },
          ].map((s, i) => (
            <View key={i} style={[styles.signerChip, { borderColor: s.signed ? T.green + '55' : T.orange + '55' }]}>
              <Text>{s.signed ? '✅' : '⏳'}</Text>
              <MonoText style={{ color: T.text2 }}>{s.addr}</MonoText>
            </View>
          ))}
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: '66%' }]} />
        </View>
      </Card>

      {/* Recent Certs */}
      <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
        <SectionLabel>Recent Certificates</SectionLabel>
      </View>
      {certs.map((c, i) => (
        <TouchableOpacity key={i} activeOpacity={0.8} style={styles.certItem}>
          <View style={styles.certAvatar}><Text style={{ fontSize: 20 }}>{c.emoji}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.certName}>{c.name}</Text>
            <MonoText>{c.course}</MonoText>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Badge label={c.status === 'valid' ? '✓ Valid' : '✗ Revoked'} color={c.status === 'valid' ? T.green : T.red} />
            <MonoText style={{ marginTop: 4 }}>{c.hash}</MonoText>
          </View>
        </TouchableOpacity>
      ))}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

// ── UPTIME TIMER (sub-component) ──────────────────────────────────────────────

function UptimeTimer() {
  const [secs, setSecs] = useState(6439);
  useEffect(() => {
    const t = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const h = String(Math.floor(secs / 3600)).padStart(2, '0');
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return (
    <View>
      <Text style={styles.timerDisplay}>{h}:{m}:{s}</Text>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
        {[`${h}h`, `${m}m`, `${s}s`].map((seg, i) => (
          <View key={i} style={styles.timeSeg}>
            <MonoText style={{ color: T.cyan }}>{seg}</MonoText>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── 3. VERIFY SCREEN ──────────────────────────────────────────────────────────

export function VerifyScreen() {
  const [hash, setHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [tab, setTab] = useState<'hash' | 'scan'>('hash');

  const verify = async () => {
    if (!hash.trim()) return;
    setLoading(true);
    try {
      const r = await api.verify(hash);
      setResult(r);
    } catch {
      // Simulated
      setResult({
        valid: Math.random() > 0.3,
        status: Math.random() > 0.3 ? 'VALID' : 'INVALID',
        issuer: '0x7B3F...2a1c',
        issued_at: new Date().toISOString(),
      });
    }
    setLoading(false);
  };

  return (
    <ScrollView style={styles.screen} showsVerticalScrollIndicator={false}>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Verify Certificate</Text>
        <Badge label="Polygon" color={T.purple} />
      </View>

      {/* Chain Row */}
      <View style={[styles.chainRow, { marginHorizontal: 16 }]}>
        <Text style={{ fontSize: 16 }}>⬡</Text>
        <Text style={{ color: T.text2, fontWeight: '600', fontSize: 13 }}>Polygon Network</Text>
        <Badge label="Chain ID: 137" color={T.green} />
      </View>

      {/* Tabs */}
      <View style={[styles.tabsRow, { marginHorizontal: 16 }]}>
        {(['hash', 'scan'] as const).map(t => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t && { color: T.text }]}>
              {t === 'hash' ? '# Enter Hash' : '📷 QR Scan'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Card style={{ margin: 16 }}>
        {tab === 'hash' ? (
          <>
            <SectionLabel>Certificate Hash / ID</SectionLabel>
            <TextInput
              style={styles.input}
              placeholder="0x3a7b8c4d..."
              placeholderTextColor={T.text3}
              value={hash}
              onChangeText={setHash}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </>
        ) : (
          <View style={styles.qrPlaceholder}>
            <Text style={{ fontSize: 48 }}>📷</Text>
            <Text style={{ color: T.text2, marginTop: 8 }}>Camera permission required</Text>
            <MonoText style={{ marginTop: 4 }}>Point at a CertChain QR code</MonoText>
          </View>
        )}
        <Btn label="Verify on Blockchain" onPress={verify} loading={loading} icon="🔍" />
      </Card>

      {result && (
        <Card style={{
          margin: 16,
          borderColor: result.valid ? T.green + '44' : T.red + '44',
          borderWidth: 1,
          backgroundColor: result.valid ? T.green + '08' : T.red + '08',
        }}>
          <Text style={{ fontSize: 40, marginBottom: 8 }}>{result.valid ? '✅' : '❌'}</Text>
          <Text style={[styles.bigNumber, { color: result.valid ? T.green : T.red, fontSize: 24 }]}>
            CERTIFICATE {result.status ?? (result.valid ? 'VALID' : 'INVALID')}
          </Text>
          {result.issuer && <MonoText style={{ marginTop: 8 }}>Issuer: {result.issuer}</MonoText>}
          {result.issued_at && <MonoText>Issued: {result.issued_at?.slice(0, 10)}</MonoText>}
        </Card>
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

// ── 4. ISSUE SCREEN ───────────────────────────────────────────────────────────

export function IssueScreen() {
  const [form, setForm] = useState({ name: '', institution: '', course: '', date: '' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [signers] = useState([
    { addr: '0x7B3F...2a1c', role: 'Admin', signed: true },
    { addr: '0xA9D1...8e4b', role: 'Issuer', signed: true },
    { addr: '0xC4E8...1f7d', role: 'Auditor', signed: false },
  ]);

  const issue = async () => {
    if (!form.name || !form.institution || !form.course) {
      Alert.alert('Missing Fields', 'Please fill in all required fields.');
      return;
    }
    setLoading(true);
    try {
      const r = await api.issue({ ...form, threshold: 2, signers: signers.map(s => s.addr) });
      setResult(r);
    } catch {
      setResult({ cert_hash: '0x' + Math.random().toString(16).slice(2), status: 'pending_signatures' });
    }
    setLoading(false);
  };

  return (
    <ScrollView style={styles.screen} showsVerticalScrollIndicator={false}>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Issue Certificate</Text>
      </View>

      <Card style={{ margin: 16 }}>
        <SectionLabel>Certificate Details</SectionLabel>
        {[
          { key: 'name', label: 'Recipient Name', ph: 'Full name...' },
          { key: 'institution', label: 'Institution', ph: 'Institution name...' },
          { key: 'course', label: 'Course / Achievement', ph: 'Course title...' },
          { key: 'date', label: 'Issue Date (YYYY-MM-DD)', ph: '2024-11-27' },
        ].map(f => (
          <View key={f.key} style={{ marginBottom: 14 }}>
            <MonoText style={{ marginBottom: 6, color: T.text3, textTransform: 'uppercase', letterSpacing: 1 }}>{f.label}</MonoText>
            <TextInput
              style={styles.input}
              placeholder={f.ph}
              placeholderTextColor={T.text3}
              value={(form as any)[f.key]}
              onChangeText={v => setForm(p => ({ ...p, [f.key]: v }))}
            />
          </View>
        ))}
        <Btn label="Issue on Blockchain" onPress={issue} loading={loading} icon="✦" />
      </Card>

      {/* Multi-Sig Panel */}
      <Card style={{ margin: 16 }}>
        <View style={styles.rowBetween}>
          <SectionLabel>Multi-Sig Approval</SectionLabel>
          <Badge label="2/3 Required" color={T.orange} />
        </View>
        <Text style={{ color: T.text3, fontSize: 12, lineHeight: 18, marginVertical: 10 }}>
          This certificate requires multi-signature approval before being written to the blockchain.
        </Text>
        {signers.map((s, i) => (
          <View key={i} style={[styles.signerChip, {
            marginBottom: 8,
            borderColor: s.signed ? T.green + '55' : T.orange + '55',
            backgroundColor: s.signed ? T.green + '08' : T.orange + '08',
          }]}>
            <Text>{s.signed ? '✅' : '⏳'}</Text>
            <View>
              <MonoText style={{ color: T.text2 }}>{s.addr}</MonoText>
              <MonoText style={{ color: T.text3 }}>{s.role}</MonoText>
            </View>
            {s.signed && <Badge label="Signed" color={T.green} />}
          </View>
        ))}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: '66%' }]} />
        </View>
        <MonoText style={{ marginTop: 6 }}>2 of 3 signatures collected</MonoText>
      </Card>

      {/* Result */}
      {result && (
        <Card style={{ margin: 16, borderColor: T.purple + '44', borderWidth: 1 }}>
          <Text style={{ fontSize: 28, marginBottom: 8 }}>✨</Text>
          <Text style={[styles.certName, { color: T.purpleL }]}>Submitted for Multi-Sig Approval</Text>
          <MonoText style={{ marginTop: 8, wordBreak: 'break-all' }}>Hash: {result.cert_hash}</MonoText>
          <MonoText>Status: {result.status}</MonoText>
          <View style={{ marginTop: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: 60 }}>▦</Text>
            <MonoText>QR Code Generated</MonoText>
          </View>
        </Card>
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

// ── 5. PROFILE SCREEN ─────────────────────────────────────────────────────────

export function ProfileScreen({ onSignOut }: { onSignOut: () => void }) {
  return (
    <ScrollView style={styles.screen} showsVerticalScrollIndicator={false}>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Profile</Text>
      </View>

      <Card style={{ margin: 16, alignItems: 'center', paddingVertical: 28 }}>
        <View style={[styles.logoIcon, { width: 72, height: 72, borderRadius: 20, marginBottom: 14 }]}>
          <Text style={{ fontSize: 36 }}>👤</Text>
        </View>
        <Text style={styles.certName}>Steve Rogers</Text>
        <MonoText>steve@certchain.io</MonoText>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <Badge label="Admin" color={T.purple} />
          <Badge label="Issuer" color={T.cyan} />
        </View>
      </Card>

      <Card style={{ margin: 16 }}>
        <SectionLabel>Wallet</SectionLabel>
        <View style={[styles.walletChip, { padding: 14, borderRadius: 12, marginTop: 10 }]}>
          <View style={styles.walletDot} />
          <View style={{ flex: 1 }}>
            <MonoText style={{ color: T.text2 }}>0x7B3F2a1cA9D18e4bC4E81f7d...2a1c</MonoText>
            <MonoText>Polygon Mainnet · Connected</MonoText>
          </View>
        </View>
      </Card>

      <Card style={{ margin: 16 }}>
        <SectionLabel>My Stats</SectionLabel>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 }}>
          {[{ val: '47', label: 'Issued' }, { val: '12', label: 'Verified' }, { val: '1', label: 'Revoked' }].map((s, i) => (
            <View key={i} style={{ alignItems: 'center' }}>
              <Text style={styles.statVal}>{s.val}</Text>
              <MonoText>{s.label}</MonoText>
            </View>
          ))}
        </View>
      </Card>

      <View style={{ margin: 16 }}>
        <Btn label="Sign Out" onPress={onSignOut} variant="outline" />
      </View>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────

const Tab = createBottomTabNavigator();

function TabIcon({ icon, focused }: { icon: string; focused: boolean }) {
  return (
    <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
      <Text style={{ fontSize: 18 }}>{icon}</Text>
    </View>
  );
}

function MainTabs({ onSignOut }: { onSignOut: () => void }) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="⬡" focused={focused} /> }}
      />
      <Tab.Screen
        name="Verify"
        component={VerifyScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="🔍" focused={focused} /> }}
      />
      <Tab.Screen
        name="Issue"
        component={IssueScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="✦" focused={focused} /> }}
      />
      <Tab.Screen
        name="Profile"
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="👤" focused={focused} /> }}
      >
        {() => <ProfileScreen onSignOut={onSignOut} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [authed, setAuthed] = useState(false);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        {authed
          ? <MainTabs onSignOut={() => setAuthed(false)} />
          : <AuthScreen onAuth={() => setAuthed(true)} />
        }
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: T.bg },
  screenHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 20 },
  screenTitle:  { fontFamily: T.display, fontSize: 24, fontWeight: '800', color: T.text, letterSpacing: -0.5 },
  greeting:     { fontFamily: T.display, fontSize: 22, fontWeight: '800', color: T.text },

  // Auth
  authContainer:{ flex: 1, backgroundColor: T.bg },
  ambientGlow:  { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: T.purple, opacity: 0.06, top: -80, right: -80 },
  logoWrap:     { alignItems: 'center', marginBottom: 48 },
  logoIcon:     { width: 64, height: 64, borderRadius: 18, backgroundColor: T.purple, alignItems: 'center', justifyContent: 'center', marginBottom: 12, shadowColor: T.purple, shadowRadius: 20, shadowOpacity: 0.5, shadowOffset: { width: 0, height: 0 } },
  logoText:     { fontFamily: T.display, fontSize: 28, fontWeight: '800', color: T.text, letterSpacing: -0.5 },
  logoSub:      { color: T.text3, fontSize: 12, marginTop: 4 },
  authTitle:    { fontFamily: T.display, fontSize: 28, fontWeight: '800', color: T.text, marginBottom: 12 },
  authSub:      { color: T.text3, fontSize: 14, lineHeight: 22, marginBottom: 28 },
  divider:      { alignItems: 'center', marginVertical: 20 },
  dividerText:  { color: T.text3, fontSize: 11 },
  walletOptions:{ gap: 10, marginBottom: 16 },
  walletOption: { padding: 16, backgroundColor: T.bg3, borderRadius: 14, borderWidth: 1, borderColor: T.border },
  walletOptionText: { color: T.text2, fontSize: 15, fontWeight: '600' },

  // Cards
  card:         { backgroundColor: T.card, borderWidth: 1, borderColor: T.border, borderRadius: 20, padding: 20 },
  statCard:     { minWidth: 120, marginRight: 12 },
  statsRow:     { flexDirection: 'row', paddingHorizontal: 16 },
  statVal:      { fontFamily: T.display, fontSize: 22, fontWeight: '800', color: T.text, marginBottom: 2 },

  // Badge
  badge:        { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 100, borderWidth: 1 },
  badgeText:    { fontSize: 11, fontWeight: '700' },

  // Btn
  btn:          { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  btnText:      { fontSize: 15, fontWeight: '700' },

  // Wallet
  walletChip:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.bg3, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: T.border },
  walletDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: T.green },

  // Timer
  timerDisplay: { fontFamily: T.mono, fontSize: 32, color: T.text, fontWeight: '700', marginTop: 8 },
  timeSeg:      { backgroundColor: 'rgba(0,212,255,0.1)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },

  // Dots / Numbers
  bigNumber:    { fontFamily: T.display, fontSize: 32, fontWeight: '800', color: T.text },
  alertBox:     { backgroundColor: 'rgba(255,77,106,0.1)', borderWidth: 1, borderColor: 'rgba(255,77,106,0.25)', borderRadius: 10, padding: 12, marginTop: 12 },

  // Progress
  progressTrack:{ height: 6, backgroundColor: T.bg3, borderRadius: 3, overflow: 'hidden', marginTop: 12 },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: T.purple },

  // Signers
  signerChip:   { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: T.border, backgroundColor: T.bg3 },

  // Certs
  certItem:     { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, marginHorizontal: 16, marginBottom: 8, backgroundColor: T.bg3, borderRadius: 16, borderWidth: 1, borderColor: T.border },
  certAvatar:   { width: 42, height: 42, borderRadius: 12, backgroundColor: T.purpleD, alignItems: 'center', justifyContent: 'center' },
  certName:     { fontSize: 14, fontWeight: '600', color: T.text, marginBottom: 2 },

  // Input
  input:        { backgroundColor: T.bg3, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 14, color: T.text, fontFamily: T.mono, fontSize: 13, marginTop: 8 },

  // Chain
  chainRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.bg3, borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: T.border },

  // Tabs
  tabsRow:      { flexDirection: 'row', backgroundColor: T.bg3, borderRadius: 14, padding: 4, marginBottom: 16 },
  tab:          { flex: 1, padding: 10, borderRadius: 10, alignItems: 'center' },
  tabActive:    { backgroundColor: T.card2, shadowColor: '#000', shadowRadius: 4, shadowOpacity: 0.3, shadowOffset: { width: 0, height: 2 } },
  tabText:      { color: T.text3, fontSize: 13, fontWeight: '600' },

  // QR
  qrPlaceholder:{ alignItems: 'center', padding: 40, backgroundColor: T.bg3, borderRadius: 14, marginBottom: 12 },

  // Section
  sectionLabel: { fontFamily: T.mono, fontSize: 10, color: T.purple, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 },
  rowBetween:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },

  // Bottom Tab Bar
  tabBar:       { backgroundColor: T.card, borderTopColor: T.border, borderTopWidth: 1, height: 80, paddingBottom: 20 },
  tabIcon:      { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tabIconActive:{ backgroundColor: T.purpleD, borderWidth: 1, borderColor: T.border2 },
});
